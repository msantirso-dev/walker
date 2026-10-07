import "server-only";
import { db, type Tx } from "@/shared/db";
import { audit, SYSTEM, type Actor } from "@/modules/audit";
import { queueEmail, orderMailSelect } from "@/modules/notifications";
import { benefitFor, isWindowOpen, loadCampaignForSale, OrderError } from "./pricing";
import { assertCapacity, lockCampaign } from "./capacity";

export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

/**
 * Recalcula importes del pedido desde el registro de pagos y aplica la confirmación.
 * Idempotente: puede llamarse cualquier número de veces con el mismo resultado.
 * Debe ejecutarse dentro de una transacción con el pedido bloqueado.
 */
export async function recomputeOrder(tx: Tx, orderId: string, actor: Actor = SYSTEM) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, campaign: { include: { benefitRule: true } }, units: { where: { status: "ACTIVE" } } },
  });
  let approvedIn = 0, refundedProvider = 0, refundManual = 0, inReview = 0;
  for (const p of order.payments) {
    if (p.kind === "REFUND") {
      if (p.status === "APPROVED") refundManual += p.amount;
      continue;
    }
    if (p.status === "APPROVED") approvedIn += p.amount;
    if (p.status === "REFUNDED") refundedProvider += p.amount;
    if (p.status === "IN_REVIEW") inReview += p.amount;
  }
  const paidAmount = approvedIn - refundManual;
  const refundedAmount = refundedProvider + refundManual;

  const data: Record<string, unknown> = { paidAmount, refundedAmount, inReviewAmount: inReview };
  let newlyConfirmed = false;

  const confirmable = order.status === "PENDING_PAYMENT" || order.status === "EXPIRED";
  if (confirmable && paidAmount >= order.depositRequired && paidAmount > 0) {
    newlyConfirmed = true;
    data.status = "CONFIRMED";
    data.confirmedAt = new Date();
    data.reservedUntil = null;
    // Un pago aprobado nunca se descarta. Si el pedido había vencido y ya no hay cupo, queda marcado para decisión administrativa.
    if (order.status === "EXPIRED") {
      const c = await loadCampaignForSale(order.campaignId, tx);
      if (c) {
        await lockCampaign(tx, c.id);
        const err = await assertCapacity(tx, c, order.units, order.id);
        if (err) {
          data.overCapacity = true;
          await audit(actor, { entity: "Order", entityId: order.id, clubId: order.clubId, action: "order.over_capacity", data: { reason: err } }, tx);
        }
      }
    }
    // Fijar el beneficio del club con la regla vigente al confirmar
    for (const u of order.units) {
      await tx.orderUnit.update({ where: { id: u.id }, data: { benefitAmount: benefitFor(order.campaign.benefitRule, u.unitPrice) } });
    }
    await audit(actor, { entity: "Order", entityId: order.id, clubId: order.clubId, action: "order.confirmed", data: { paidAmount } }, tx);
  }
  await tx.order.update({ where: { id: orderId }, data });
  return { newlyConfirmed, paidAmount, inReview };
}

/** Vence reservas de pedidos sin pago ni comprobante en revisión. */
export async function expireReservations() {
  const now = new Date();
  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", reservedUntil: { lt: now }, inReviewAmount: 0, paidAmount: 0 },
    select: { id: true, clubId: true },
    take: 500,
  });
  for (const o of stale) {
    await db.$transaction(async (tx) => {
      await lockOrder(tx, o.id);
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: o.id } });
      if (fresh.status !== "PENDING_PAYMENT" || fresh.inReviewAmount > 0 || fresh.paidAmount > 0 || !fresh.reservedUntil || fresh.reservedUntil > now) return;
      await tx.order.update({ where: { id: o.id }, data: { status: "EXPIRED" } });
      await audit(SYSTEM, { entity: "Order", entityId: o.id, clubId: o.clubId, action: "order.expired" }, tx);
    });
  }
  return stale.length;
}

/**
 * Vuelve a reservar cupo para reintentar el pago de un pedido sin pago.
 * No duplica el pedido: renueva la reserva del mismo.
 */
export async function renewReservation(tx: Tx, orderId: string, method: "MERCADOPAGO" | "TRANSFER", actor: Actor) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { units: { where: { status: "ACTIVE" } } } });
  if (order.status === "CONFIRMED" || order.status === "CANCELLED") return;
  const c = await loadCampaignForSale(order.campaignId, tx);
  if (!c) throw new OrderError("La campaña no existe.");
  const now = new Date();
  const stillHeld = order.status === "PENDING_PAYMENT" && order.reservedUntil && order.reservedUntil > now;
  if (!stillHeld) {
    if (!isWindowOpen(c, now)) throw new OrderError("La reserva venció y la ventana de compra ya cerró.", "closed");
    await lockCampaign(tx, c.id);
    const err = await assertCapacity(tx, c, order.units, order.id);
    if (err) throw new OrderError(`La reserva venció y ya no hay cupo. ${err}`, "capacity");
  }
  const holdMs = method === "MERCADOPAGO" ? c.mpReservationMinutes * 60_000 : c.transferHoldHours * 3600_000;
  const until = new Date(Math.max(now.getTime() + holdMs, order.reservedUntil && stillHeld ? order.reservedUntil.getTime() : 0));
  await tx.order.update({ where: { id: orderId }, data: { status: "PENDING_PAYMENT", reservedUntil: until } });
  if (order.status === "EXPIRED") await audit(actor, { entity: "Order", entityId: orderId, clubId: order.clubId, action: "order.reactivated" }, tx);
}

export async function notifyConfirmedPayment(tx: Tx, orderId: string, amount: number) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: orderMailSelect });
  await queueEmail("PAYMENT_CONFIRMED", o, { amount }, tx);
}
