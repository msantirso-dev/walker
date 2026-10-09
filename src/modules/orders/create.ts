import "server-only";
import { db } from "@/shared/db";
import { decryptSecret, encryptSecret, randomCode, randomToken, sha256 } from "@/shared/crypto";
import { Prisma } from "@/generated/prisma/client";
import { audit, BUYER } from "@/modules/audit";
import { queueEmail, orderMailSelect } from "@/modules/notifications";
import { cartSchema, type CartInput } from "./cart-schema";
import { loadCampaignForSale, priceCart, isWindowOpen, OrderError, type SaleCampaign } from "./pricing";
import { assertCapacity, lockCampaign } from "./capacity";
import { CHANGE_POLICY_TEXT, CHANGE_POLICY_UNPERSONALIZED, CHANGE_POLICY_VERSION } from "@/modules/catalog/options";
import { simulatorEnabled } from "@/shared/env";

export function termsOf(c: SaleCampaign) {
  return {
    club: c.club.name,
    campaign: c.title,
    season: c.season,
    paymentMode: c.paymentMode,
    depositType: c.depositType,
    depositValue: c.depositValue,
    balanceDue: c.balanceDueText,
    receiver: { owner: c.paymentAccount.owner, label: c.paymentAccount.label },
    deliveryDays: [c.deliveryDaysMin, c.deliveryDaysMax],
    closesAt: c.closesAt.toISOString(),
    minUnits: c.minUnits,
    minPolicy: c.minPolicyText,
    policies: { changes: c.policyChanges, cancellation: c.policyCancellation, refunds: c.policyRefunds },
    pricingModel: c.pricingModel,
    payments:
      c.pricingModel === "TEXTIL_ADVANCE"
        ? "El anticipo se paga ahora por Mercado Pago a la textil. El saldo, si lo hay, se paga al club antes del retiro."
        : null,
    changePolicy: { version: CHANGE_POLICY_VERSION, personalized: CHANGE_POLICY_TEXT, other: CHANGE_POLICY_UNPERSONALIZED },
    clubConditions: c.club.conditions,
    pickup: c.pickupEnabled ? { address: c.club.pickupAddress, hours: c.club.pickupHours } : null,
    shipping: c.shippingEnabled ? { price: c.shippingPrice, notes: c.shippingNotes } : null,
  };
}

export type CreateResult = { token: string; orderId: string; code: string; payMethod: CartInput["payMethod"]; payKind: CartInput["payKind"]; existing: boolean };

/** Socio con sesión que hace el pedido: sus datos reemplazan los del formulario. */
export type OrderMember = { id: string; name: string; email: string; phone: string | null };

export async function createOrder(campaignId: string, raw: unknown, member?: OrderMember): Promise<CreateResult> {
  if (member && raw && typeof raw === "object") {
    const r = raw as { buyer?: Record<string, unknown> };
    r.buyer = { ...(r.buyer ?? {}), name: member.name, email: member.email, phone: member.phone || r.buyer?.phone };
  }
  const parsed = cartSchema.safeParse(raw);
  if (!parsed.success) throw new OrderError(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const cart = parsed.data;

  // Reintento del mismo envío (doble clic, red lenta): devolver el pedido existente.
  const prev = await db.order.findUnique({ where: { campaignId_idempotencyKey: { campaignId, idempotencyKey: cart.idempotencyKey } } });
  if (prev) return { token: decryptSecret(prev.accessTokenEnc), orderId: prev.id, code: prev.code, payMethod: cart.payMethod, payKind: cart.payKind, existing: true };

  const token = randomToken();
  try {
    const order = await db.$transaction(
      async (tx) => {
        await lockCampaign(tx, campaignId);
        const c = await loadCampaignForSale(campaignId, tx);
        if (!c) throw new OrderError("La campaña no existe.", "not_found");
        if (!isWindowOpen(c)) throw new OrderError("La ventana de compra está cerrada.", "closed");
        if (cart.payMethod === "MERCADOPAGO" && !c.allowMercadoPago) throw new OrderError("Esta campaña no acepta Mercado Pago.");
        if (cart.payMethod === "TRANSFER" && !c.allowTransfer) throw new OrderError("Esta campaña no acepta transferencias.");
        if (c.pricingModel === "LEGACY_DEPOSIT" && cart.payKind === "DEPOSIT" && c.paymentMode === "FULL") throw new OrderError("Esta campaña requiere el pago total.");
        if (c.club.isDemo && !simulatorEnabled()) throw new OrderError("Esta es una tienda de demostración: no admite compras.");
        // Número de socio: solo si el club lo configura (y no equivale a membresía validada)
        const numberMode = c.club.memberNumberMode;
        if (numberMode === "REQUIRED" && !cart.buyer.memberNumber) throw new OrderError("Este club pide tu número de socio para comprar.");

        const priced = priceCart(c, cart);
        // Política de cambios de prendas personalizadas: rige para las campañas del modelo v2
        if (c.pricingModel === "TEXTIL_ADVANCE" && priced.units.some((u) => u.noSizeChange) && cart.policyVersion !== CHANGE_POLICY_VERSION)
          throw new OrderError("Aceptá la condición de cambios: las prendas con nombre o número no admiten cambio de talle.", "policy");
        const capErr = await assertCapacity(tx, c, priced.units);
        if (capErr) throw new OrderError(capErr, "capacity");

        const buyer = await tx.buyer.upsert({
          where: { clubId_email: { clubId: c.clubId, email: cart.buyer.email } },
          create: { clubId: c.clubId, email: cart.buyer.email, name: cart.buyer.name, phone: cart.buyer.phone },
          update: { name: cart.buyer.name, phone: cart.buyer.phone },
        });

        const terms = termsOf(c);
        const now = new Date();
        const holdMs = cart.payMethod === "MERCADOPAGO" ? c.mpReservationMinutes * 60_000 : c.transferHoldHours * 3600_000;

        const order = await tx.order.create({
          data: {
            code: `${randomCode(3)}-${randomCode(4)}`,
            accessTokenHash: sha256(token),
            accessTokenEnc: encryptSecret(token),
            pickupCode: randomCode(10),
            idempotencyKey: cart.idempotencyKey,
            clubId: c.clubId,
            campaignId: c.id,
            buyerId: buyer.id,
            buyerName: cart.buyer.name,
            buyerEmail: cart.buyer.email,
            buyerPhone: cart.buyer.phone,
            memberNumber: numberMode === "HIDDEN" ? null : cart.buyer.memberNumber || null,
            memberId: member?.id ?? null,
            deductionBpA: c.pricingModel === "TEXTIL_ADVANCE" ? c.deductionBpA : null,
            deductionBpB: c.pricingModel === "TEXTIL_ADVANCE" ? c.deductionBpB : null,
            deliveryMethod: cart.delivery.method,
            shippingAddress: cart.delivery.method === "SHIPPING" ? cart.delivery.address : null,
            notes: cart.notes || null,
            itemsTotal: priced.itemsTotal,
            persTotal: priced.persTotal,
            shippingTotal: priced.shippingTotal,
            total: priced.total,
            depositRequired: priced.depositRequired,
            pricingModel: c.pricingModel,
            advanceRequired: priced.advanceRequired,
            clubTaxBp: c.pricingModel === "TEXTIL_ADVANCE" ? c.clubTaxBp : null,
            clubBalanceRequired: priced.clubBalanceRequired,
            policyVersion: c.pricingModel === "TEXTIL_ADVANCE" && priced.units.some((u) => u.noSizeChange) ? CHANGE_POLICY_VERSION : null,
            reservedUntil: new Date(now.getTime() + holdMs),
            termsSnapshot: terms,
            termsHash: sha256(JSON.stringify(terms)),
            termsAcceptedAt: now,
          },
        });

        const playerIds = new Map<string, string>();
        for (const [i, p] of cart.players.entries()) {
          if (!priced.units.some((u) => u.playerKey === p.key)) continue; // jugador sin prendas
          const row = await tx.player.create({
            data: { orderId: order.id, name: p.name, sport: p.sport || null, category: p.category || null, team: p.team || null, sort: i },
          });
          playerIds.set(p.key, row.id);
        }
        for (const [i, u] of priced.units.entries()) {
          await tx.orderUnit.create({
            data: {
              ref: `U-${randomCode(6)}`,
              orderId: order.id,
              productId: u.productId,
              productCode: u.productCode,
              productName: u.productName,
              productDesc: u.productDesc,
              unitPrice: u.unitPrice,
              listPrice: u.listPrice,
              playerId: u.playerKey ? playerIds.get(u.playerKey) ?? null : null,
              persName: u.persName,
              persNumber: u.persNumber,
              persPrice: u.persPrice,
              textilPrice: u.textilPrice,
              optionsTextil: u.optionsTextil,
              optionsClub: u.optionsClub,
              advanceAmount: u.advanceAmount,
              legend: u.legend,
              noSizeChange: u.noSizeChange,
              sort: i,
              components: { create: u.components },
              options: { create: u.options.map((o) => ({ groupId: o.groupId, groupName: o.groupName, role: o.role, value: o.value, priceTextil: o.priceTextil, priceClub: o.priceClub, sort: o.sort })) },
            },
          });
        }
        await audit(BUYER, {
          entity: "Order", entityId: order.id, clubId: c.clubId, action: "order.created",
          data: { units: priced.units.length, total: priced.total, deposit: priced.depositRequired, advance: priced.advanceRequired, clubBalance: priced.clubBalanceRequired, model: c.pricingModel, payMethod: cart.payMethod },
        }, tx);
        const forMail = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: orderMailSelect });
        await queueEmail("ORDER_RECEIVED", forMail, undefined, tx);
        return order;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 15_000 },
    );
    return { token, orderId: order.id, code: order.code, payMethod: cart.payMethod, payKind: cart.payKind, existing: false };
  } catch (e) {
    // Carrera entre dos envíos idénticos: el segundo choca con la restricción única.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.order.findUnique({ where: { campaignId_idempotencyKey: { campaignId, idempotencyKey: cart.idempotencyKey } } });
      if (again) return { token: decryptSecret(again.accessTokenEnc), orderId: again.id, code: again.code, payMethod: cart.payMethod, payKind: cart.payKind, existing: true };
    }
    throw e;
  }
}
