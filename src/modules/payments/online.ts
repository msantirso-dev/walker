import "server-only";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { decryptSecret } from "@/shared/crypto";
import { audit, BUYER, PROVIDER, type Actor } from "@/modules/audit";
import { lockOrder, recomputeOrder, renewReservation, notifyConfirmedPayment } from "@/modules/orders/recompute";
import { OrderError } from "@/modules/orders/pricing";
import { providerFor } from "./accounts";
import { amountFor } from "./due";
import { SimulatorProvider } from "./providers/simulator";
import type { PaymentProvider, ProviderStatus } from "./providers/types";
import type { PaymentKind, PaymentStatus } from "@/generated/prisma/client";

/**
 * Inicia (o reutiliza) un pago online del pedido y devuelve la URL del checkout alojado.
 * Nunca crea un pedido nuevo: los reintentos agregan intentos de pago al mismo pedido.
 */
export async function startOnlinePayment(orderId: string, kind: PaymentKind, actor: Actor = BUYER): Promise<string> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { campaign: { include: { paymentAccount: true, club: true } } } });
  const c = order.campaign;
  if (!c.allowMercadoPago) throw new OrderError("Esta campaña no acepta pagos con Mercado Pago.");
  const provider = providerFor(c.paymentAccount);
  if (!provider) throw new OrderError("El pago con Mercado Pago todavía no está habilitado para esta campaña. Usá transferencia.");
  if (order.inReviewAmount > 0) throw new OrderError("Tenés un comprobante de transferencia en revisión. Esperá la respuesta antes de pagar de otra forma.");

  const payment = await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const due = amountFor(fresh, c, fresh.status === "CONFIRMED" ? "BALANCE" : kind);
    if (!due) throw new OrderError("No hay importes pendientes para ese tipo de pago.");
    if (fresh.status !== "CONFIRMED") await renewReservation(tx, orderId, "MERCADOPAGO", actor);
    const after = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

    // Reutilizar un intento abierto con el mismo importe para no generar cobros duplicados
    const open = await tx.payment.findFirst({
      where: {
        orderId, method: "MERCADOPAGO", kind: due.kind, amount: due.amount, status: { in: ["CREATED", "PENDING"] },
        initPoint: { not: null }, expiresAt: { gt: new Date(Date.now() + 2 * 60_000) }, simulated: provider.simulated,
      },
      orderBy: { createdAt: "desc" },
    });
    if (open) return open;

    const expiresAt = due.kind === "BALANCE" || !after.reservedUntil ? new Date(Date.now() + 24 * 3600_000) : after.reservedUntil;
    const p = await tx.payment.create({
      data: { orderId, kind: due.kind, method: "MERCADOPAGO", amount: due.amount, status: "CREATED", expiresAt, simulated: provider.simulated },
    });
    await audit(actor, { entity: "Order", entityId: orderId, clubId: order.clubId, action: "payment.created", data: { paymentId: p.id, kind: due.kind, amount: due.amount, simulated: provider.simulated } }, tx);
    return p;
  });
  if (payment.initPoint) return payment.initPoint;

  const token = decryptSecret(order.accessTokenEnc);
  const res = await provider.createCheckout({
    paymentId: payment.id,
    orderCode: order.code,
    title: `${payment.kind === "BALANCE" ? "Saldo" : payment.kind === "DEPOSIT" ? "Seña" : "Pago"} pedido ${order.code} · ${c.club.name}`,
    amount: payment.amount,
    payerEmail: order.buyerEmail,
    payerName: order.buyerName,
    backUrl: `${env().APP_URL}/pedido/${token}?retorno=1`,
    notificationUrl: `${env().APP_URL}/api/webhooks/mercadopago/${c.paymentAccountId}`,
    expiresAt: payment.expiresAt!,
    statementDescriptor: c.club.shortName ?? undefined,
  });
  await db.payment.update({ where: { id: payment.id }, data: { providerPreferenceId: res.preferenceId, initPoint: res.initPoint } });
  return res.initPoint;
}

const RANK: Record<PaymentStatus, number> = { CREATED: 0, PENDING: 1, IN_REVIEW: 1, EXPIRED: 1, REJECTED: 2, CANCELLED: 2, APPROVED: 3, REFUNDED: 4 };

export type ProcessResult = "applied" | "unchanged" | "not_found" | "unknown_reference" | "account_mismatch" | "amount_mismatch";

/**
 * Procesa la notificación de un pago consultando su estado real al proveedor.
 * Idempotente y tolerante al desorden: repetir la misma notificación no duplica nada.
 */
export async function processProviderPayment(
  source: { kind: "account"; accountId: string } | { kind: "simulator" },
  providerPaymentId: string,
): Promise<ProcessResult> {
  let provider: PaymentProvider | null;
  let account: { id: string } | null = null;
  if (source.kind === "simulator") {
    provider = new SimulatorProvider();
  } else {
    const acc = await db.paymentAccount.findUnique({ where: { id: source.accountId } });
    if (!acc) return "account_mismatch";
    account = acc;
    provider = providerFor(acc);
    if (!provider || provider.simulated) return "account_mismatch";
  }

  const pp = await provider.getPayment(providerPaymentId);
  if (!pp) return "not_found";
  if (!pp.externalReference) return "unknown_reference";
  const base = await db.payment.findUnique({ where: { id: pp.externalReference }, include: { order: { include: { campaign: true } } } });
  if (!base) return "unknown_reference";
  if (base.simulated !== provider.simulated) return "account_mismatch";
  if (account && base.order.campaign.paymentAccountId !== account.id) return "account_mismatch";

  return db.$transaction(async (tx) => {
    await lockOrder(tx, base.orderId);
    let target = await tx.payment.findUnique({ where: { providerPaymentId: pp.id } });
    if (!target) {
      const row = await tx.payment.findUniqueOrThrow({ where: { id: base.id } });
      target = row.providerPaymentId
        ? // Mercado Pago permite reintentar dentro del mismo checkout: cada intento es un pago distinto.
          await tx.payment.create({
            data: {
              orderId: row.orderId, kind: row.kind, method: row.method, amount: row.amount, status: "CREATED",
              providerPreferenceId: row.providerPreferenceId, providerPaymentId: pp.id, simulated: row.simulated, expiresAt: row.expiresAt,
            },
          })
        : await tx.payment.update({ where: { id: row.id }, data: { providerPaymentId: pp.id } });
    }

    if (pp.currency !== "ARS" || pp.amount !== target.amount) {
      await tx.payment.update({ where: { id: target.id }, data: { statusDetail: `amount_mismatch: ${pp.amount} ${pp.currency}` } });
      await audit(PROVIDER, { entity: "Order", entityId: target.orderId, clubId: base.order.clubId, action: "payment.status", data: { paymentId: target.id, error: "amount_mismatch", provider: pp.amount, expected: target.amount } }, tx);
      return "amount_mismatch" as const;
    }

    const next = pp.status as ProviderStatus as PaymentStatus;
    if (target.status === next || RANK[next] < RANK[target.status]) {
      await recomputeOrder(tx, target.orderId, PROVIDER);
      return "unchanged" as const;
    }
    await tx.payment.update({ where: { id: target.id }, data: { status: next, statusDetail: pp.statusDetail } });
    await audit(PROVIDER, {
      entity: "Order", entityId: target.orderId, clubId: base.order.clubId, action: "payment.status",
      data: { paymentId: target.id, providerPaymentId: pp.id, from: target.status, to: next, simulated: target.simulated },
    }, tx);
    await recomputeOrder(tx, target.orderId, PROVIDER);
    if (next === "APPROVED") await notifyConfirmedPayment(tx, target.orderId, target.amount);
    return "applied" as const;
  });
}
