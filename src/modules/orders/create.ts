import "server-only";
import { db } from "@/shared/db";
import { decryptSecret, encryptSecret, randomCode, randomToken, sha256 } from "@/shared/crypto";
import { Prisma } from "@/generated/prisma/client";
import { audit, BUYER } from "@/modules/audit";
import { queueEmail, orderMailSelect } from "@/modules/notifications";
import { cartSchema, type CartInput } from "./cart-schema";
import { loadCampaignForSale, priceCart, isWindowOpen, OrderError, type SaleCampaign } from "./pricing";
import { assertCapacity, lockCampaign } from "./capacity";

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
    clubConditions: c.club.conditions,
    pickup: c.pickupEnabled ? { address: c.club.pickupAddress, hours: c.club.pickupHours } : null,
    shipping: c.shippingEnabled ? { price: c.shippingPrice, notes: c.shippingNotes } : null,
  };
}

export type CreateResult = { token: string; orderId: string; code: string; payMethod: CartInput["payMethod"]; payKind: CartInput["payKind"]; existing: boolean };

export async function createOrder(campaignId: string, raw: unknown): Promise<CreateResult> {
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
        if (cart.payKind === "DEPOSIT" && c.paymentMode === "FULL") throw new OrderError("Esta campaña requiere el pago total.");
        if (c.memberNumberMode === "REQUIRED" && !cart.buyer.memberNumber) throw new OrderError("Completá tu número de socio.");

        const priced = priceCart(c, cart);
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
            memberNumber: c.memberNumberMode === "HIDDEN" ? null : cart.buyer.memberNumber || null,
            deliveryMethod: cart.delivery.method,
            shippingAddress: cart.delivery.method === "SHIPPING" ? cart.delivery.address : null,
            notes: cart.notes || null,
            itemsTotal: priced.itemsTotal,
            persTotal: priced.persTotal,
            shippingTotal: priced.shippingTotal,
            total: priced.total,
            depositRequired: priced.depositRequired,
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
              sort: i,
              components: { create: u.components },
            },
          });
        }
        await audit(BUYER, {
          entity: "Order", entityId: order.id, clubId: c.clubId, action: "order.created",
          data: { units: priced.units.length, total: priced.total, deposit: priced.depositRequired, payMethod: cart.payMethod },
        }, tx);
        const forMail = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: orderMailSelect });
        await queueEmail("ORDER_RECEIVED", forMail, undefined, tx);
        return order;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
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
