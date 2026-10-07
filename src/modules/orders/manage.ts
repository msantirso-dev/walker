import "server-only";
import { db, type Tx } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { queueEmail, orderMailSelect } from "@/modules/notifications";
import { depositFor, OrderError } from "./pricing";
import { lockOrder, recomputeOrder } from "./recompute";

/** Recalcula totales desde las unidades activas (tras cancelar una unidad). */
async function recalcTotals(tx: Tx, orderId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { units: { where: { status: "ACTIVE" } }, campaign: true } });
  const itemsTotal = o.units.reduce((a, u) => a + u.unitPrice, 0);
  const persTotal = o.units.reduce((a, u) => a + u.persPrice, 0);
  const shippingTotal = o.units.length ? o.shippingTotal : 0;
  const total = itemsTotal + persTotal + shippingTotal;
  // La seña requerida no aumenta por una cancelación parcial
  const depositRequired = Math.min(o.depositRequired, depositFor(o.campaign, itemsTotal + persTotal, total));
  await tx.order.update({ where: { id: orderId }, data: { itemsTotal, persTotal, shippingTotal, total, depositRequired } });
}

export async function cancelOrder(actor: Actor, orderId: string, reason: string) {
  if (reason.trim().length < 5) throw new OrderError("Indicá el motivo de la cancelación.");
  await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status === "CANCELLED") throw new OrderError("El pedido ya está cancelado.");
    if (o.deliveryStatus === "DELIVERED") throw new OrderError("No se puede cancelar un pedido entregado.");
    await tx.orderUnit.updateMany({ where: { orderId, status: "ACTIVE", deliveryId: null }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await tx.payment.updateMany({ where: { orderId, status: { in: ["CREATED", "PENDING"] } }, data: { status: "CANCELLED", statusDetail: "order_cancelled" } });
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim(), reservedUntil: null } });
    await audit(actor, { entity: "Order", entityId: orderId, clubId: o.clubId, action: "order.cancelled", data: { reason: reason.trim(), paidAmount: o.paidAmount } }, tx);
    await queueEmail("ORDER_CANCELLED", await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: orderMailSelect }), { reason: reason.trim() }, tx);
  });
}

export async function cancelUnit(actor: Actor, unitId: string, reason: string) {
  if (reason.trim().length < 5) throw new OrderError("Indicá el motivo.");
  const u = await db.orderUnit.findUnique({ where: { id: unitId }, include: { order: true } });
  if (!u) throw new OrderError("Unidad inexistente.");
  await db.$transaction(async (tx) => {
    await lockOrder(tx, u.orderId);
    const cur = await tx.orderUnit.findUniqueOrThrow({ where: { id: unitId } });
    if (cur.status !== "ACTIVE") throw new OrderError("La unidad ya está cancelada.");
    if (cur.deliveryId) throw new OrderError("La unidad ya fue entregada.");
    const active = await tx.orderUnit.count({ where: { orderId: u.orderId, status: "ACTIVE" } });
    if (active <= 1) throw new OrderError("Es la última prenda del pedido: cancelá el pedido completo.");
    await tx.orderUnit.update({ where: { id: unitId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await recalcTotals(tx, u.orderId);
    await audit(actor, { entity: "Order", entityId: u.orderId, clubId: u.order.clubId, action: "order.unit_cancelled", data: { unit: cur.ref, product: cur.productName, reason: reason.trim() } }, tx);
    await recomputeOrder(tx, u.orderId, actor);
  });
}
