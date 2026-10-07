import "server-only";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { audit, type Actor } from "@/modules/audit";
import { can, type SessionUser } from "@/modules/auth";
import { queueEmail, orderMailSelect } from "@/modules/notifications";
import { lockOrder } from "@/modules/orders/recompute";
import { OrderError } from "@/modules/orders/pricing";

export function normalizePickupCode(raw: string) {
  const s = raw.trim().toUpperCase();
  const m = s.match(/(?:RETIRO[:/-]|\/CODIGO\/)([A-Z0-9]{10})$/) ?? s.match(/^([A-Z0-9]{10})$/);
  return m ? m[1] : null;
}

/**
 * Contenido del QR de retiro: un enlace al panel con el identificador aleatorio.
 * No contiene datos personales y solo funciona para usuarios del club autenticados.
 */
export const pickupQrPayload = (pickupCode: string) => `${env().APP_URL}/admin/entregas/codigo/${pickupCode}`;

export async function registerDelivery(
  user: SessionUser,
  actor: Actor,
  orderId: string,
  input: { unitIds: string[]; receivedByName: string; receivedByNote?: string; exceptionReason?: string; notes?: string },
) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || !can(user, "deliveries.register", order.clubId)) throw new OrderError("Pedido inexistente.");
  if (input.receivedByName.trim().length < 3) throw new OrderError("Indicá el nombre de quien retira.");
  if (!input.unitIds.length) throw new OrderError("Seleccioná al menos una prenda para entregar.");

  return db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { units: true } });
    if (o.status !== "CONFIRMED") throw new OrderError("Solo se entregan pedidos confirmados.");
    if (o.deliveryStatus === "NOT_READY") throw new OrderError("Las prendas de este pedido todavía no están disponibles en el club.");

    const balance = o.total - o.paidAmount;
    let exception: string | null = null;
    if (balance > 0) {
      if (!can(user, "deliveries.exception", o.clubId)) throw new OrderError("El pedido tiene saldo pendiente. Solo un administrador puede autorizar la entrega.");
      if ((input.exceptionReason?.trim().length ?? 0) < 5) throw new OrderError("El pedido tiene saldo pendiente. Para entregar igual, escribí el motivo de la excepción.");
      exception = input.exceptionReason!.trim();
    }

    const deliverable = new Map(o.units.filter((u) => u.status === "ACTIVE" && !u.deliveryId).map((u) => [u.id, u]));
    // Solo prendas incluidas en un lote recibido por el club
    const inReceived = await tx.productionLotUnit.groupBy({
      by: ["unitId"],
      where: { unitId: { in: input.unitIds }, lot: { status: "RECEIVED_BY_CLUB" } },
      _sum: { delta: true },
    });
    const ready = new Set(inReceived.filter((r) => (r._sum.delta ?? 0) > 0).map((r) => r.unitId));
    for (const id of input.unitIds) {
      if (!deliverable.has(id)) throw new OrderError("Una de las prendas ya fue entregada o no pertenece al pedido.");
      if (!ready.has(id)) throw new OrderError(`La prenda ${deliverable.get(id)!.ref} todavía no llegó al club.`);
    }

    const d = await tx.delivery.create({
      data: {
        orderId, deliveredById: user.id, receivedByName: input.receivedByName.trim(), receivedByNote: input.receivedByNote?.trim() || null,
        balanceException: exception, notes: input.notes?.trim() || null,
      },
    });
    await tx.orderUnit.updateMany({ where: { id: { in: input.unitIds } }, data: { deliveryId: d.id } });
    const remaining = await tx.orderUnit.count({ where: { orderId, status: "ACTIVE", deliveryId: null } });
    await tx.order.update({ where: { id: orderId }, data: { deliveryStatus: remaining ? "PARTIAL" : "DELIVERED" } });
    await audit(actor, { entity: "Order", entityId: orderId, clubId: o.clubId, action: "delivery.registered", data: { deliveryId: d.id, units: input.unitIds.length, receivedBy: d.receivedByName, remaining } }, tx);
    if (exception) await audit(actor, { entity: "Order", entityId: orderId, clubId: o.clubId, action: "delivery.exception", data: { deliveryId: d.id, balance, reason: exception } }, tx);
    await queueEmail("DELIVERED", await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: orderMailSelect }), { units: input.unitIds.length }, tx);
    return d;
  });
}

/** Unidades listas para entregar (en lote recibido por el club). */
export async function readyUnitIds(orderId: string) {
  const rows = await db.productionLotUnit.groupBy({
    by: ["unitId"],
    where: { unit: { orderId, status: "ACTIVE", deliveryId: null }, lot: { status: "RECEIVED_BY_CLUB" } },
    _sum: { delta: true },
  });
  return new Set(rows.filter((r) => (r._sum.delta ?? 0) > 0).map((r) => r.unitId));
}
