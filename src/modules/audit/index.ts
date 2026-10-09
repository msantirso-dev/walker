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
  entry: {
    entity: string;
    entityId: string;
    action: string;
    clubId?: string | null;
    data?: Prisma.InputJsonValue;
    /** Modificaciones sensibles: valor anterior y nuevo de los campos que cambiaron */
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
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
      before: entry.before,
      after: entry.after,
      ip: actor.ip ?? null,
    },
  });
}

/** Devuelve solo los campos que cambiaron, como { before, after }. */
export function diffFields<T extends Record<string, unknown>>(prev: T, next: Partial<T>) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of Object.keys(next)) {
    const a = prev[k] instanceof Date ? (prev[k] as Date).toISOString() : prev[k];
    const b = next[k] instanceof Date ? (next[k] as Date).toISOString() : next[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      before[k] = a ?? null;
      after[k] = b ?? null;
    }
  }
  return { before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, changed: Object.keys(after).length > 0 };
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
  "campaign.activation_requested": "Activación solicitada por el club",
  "campaign.activation_approved": "Activación autorizada por la textil",
  "campaign.activation_rejected": "Solicitud de activación devuelta",
  "campaign.prices": "Precios de campaña modificados",
  "campaign.rule": "Regla de producción modificada",
  "campaign.rule_approved": "Regla de producción aprobada",
  "campaign.audience": "Alcance de campaña modificado",
  "agreement.created": "Acuerdo creado",
  "agreement.updated": "Acuerdo modificado",
  "agreement.expired": "Acuerdo vencido",
  "agreement.alert": "Aviso de vencimiento de acuerdo",
  "samples.created": "Curva de muestrario creada",
  "samples.updated": "Curva de muestrario modificada",
  "samples.link": "Equivalencia de muestrario",
  "purchase.created": "Compra del club registrada",
  "purchase.updated": "Compra del club modificada",
  "purchase.approved": "Compra del club aprobada",
  "report.distribution": "Descarga de lista de distribución",
  "clubsheet.updated": "Planilla del club actualizada",
  "club.management_panel": "Planilla de gestión del club (servicio)",
  "campaign.club_commit": "Compromiso del club por la diferencia del mínimo",
  "campaign.shortfall_purchase": "Compra de la diferencia o respaldo sugerida",
};
