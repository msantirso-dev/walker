import "server-only";
import { db, type Tx } from "@/shared/db";
import type { Prisma } from "@/generated/prisma/client";

export type Actor = { id?: string | null; role: string; clubId?: string | null; ip?: string | null };

export const SYSTEM: Actor = { role: "SYSTEM" };
export const BUYER: Actor = { role: "BUYER" };
export const PROVIDER: Actor = { role: "PROVIDER" };

/** Registra una operación sensible. Usa la transacción si se pasa. */
export async function audit(
  actor: Actor,
  entry: { entity: string; entityId: string; action: string; clubId?: string | null; data?: Prisma.InputJsonValue },
  tx?: Tx,
) {
  const client = tx ?? db;
  await client.auditLog.create({
    data: {
      actorId: actor.id ?? null,
      actorRole: actor.role,
      clubId: entry.clubId ?? actor.clubId ?? null,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      data: entry.data,
      ip: actor.ip ?? null,
    },
  });
}

export async function history(entity: string, entityId: string) {
  return db.auditLog.findMany({ where: { entity, entityId }, orderBy: { createdAt: "asc" } });
}

export const ACTION_LABELS: Record<string, string> = {
  "order.created": "Pedido creado",
  "order.confirmed": "Pedido confirmado",
  "order.expired": "Reserva vencida",
  "order.reactivated": "Pedido reactivado",
  "order.cancelled": "Pedido cancelado",
  "order.unit_cancelled": "Unidad cancelada",
  "order.over_capacity": "Pago aprobado fuera de cupo",
  "payment.created": "Intento de pago creado",
  "payment.status": "Estado de pago actualizado",
  "payment.receipt_submitted": "Comprobante cargado",
  "payment.approved": "Pago aprobado",
  "payment.rejected": "Comprobante rechazado",
  "payment.manual": "Pago registrado manualmente",
  "payment.refund": "Devolución registrada",
  "delivery.registered": "Entrega registrada",
  "delivery.exception": "Entrega con saldo pendiente (excepción)",
  "order.links_resent": "Enlace del pedido reenviado al comprador",
  "order.unit_edited": "Prenda modificada",
  "payment.club_balance": "Saldo cobrado por el club",
  "shipment.created": "Despacho al club creado",
  "shipment.dispatched": "Despacho enviado al club",
  "shipment.received": "Producción recibida por el club",
};
