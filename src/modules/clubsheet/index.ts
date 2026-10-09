import "server-only";
import { db } from "@/shared/db";
import { audit, diffFields, type Actor } from "@/modules/audit";
import { OrderError } from "@/modules/orders/pricing";
import type { SessionUser } from "@/modules/auth";
import type { ClubSheetStatus, LotStatus } from "@/generated/prisma/client";

/**
 * Planilla de gestión del club (servicio adicional, se activa por club).
 *
 * El seguimiento del sistema termina cuando la producción está en el club, lista para retirar:
 * la venta ya está cubierta por el anticipo. Desde ahí el club cobra su saldo, refinancia o entrega
 * como decida, y lo anota en esta planilla. Es data entry del club: no modifica pedidos, pagos,
 * estados ni reportes del sistema, y nada del sistema depende de lo que se cargue acá.
 */

export const SHEET_STATUS_LABEL: Record<ClubSheetStatus, string> = {
  PENDING: "Por retirar",
  BALANCE_PAID: "Saldo cobrado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  OTHER: "Otro",
};

/** Etapa del pedido en el sistema (solo lectura para el club). */
export function systemStage(o: { status: string; units: { lotUnits: { delta: number; lot: { status: LotStatus } }[] }[] }) {
  if (o.status !== "CONFIRMED") return o.status === "CANCELLED" ? "Cancelado" : "Anticipo pendiente";
  const st = o.units.flatMap((u) => u.lotUnits.filter((l) => l.delta > 0).map((l) => l.lot.status));
  if (!st.length) return "Anticipo aprobado · a la espera del cierre";
  if (st.every((s) => s === "RECEIVED_BY_CLUB")) return "En el club · listo para retirar";
  return "En producción";
}

/** La planilla la carga la empresa con las novedades y pagos externos que comunica el club. */
export function canEditSheet(user: SessionUser, _club: { id: string; managementPanel: boolean }) {
  return user.role === "TEXTIL_ADMIN";
}

/** El club la consulta (servicio adicional habilitado); la empresa siempre. */
export function canViewSheet(user: SessionUser, club: { id: string; managementPanel: boolean }) {
  if (user.role === "TEXTIL_ADMIN") return true;
  return club.managementPanel && (user.role === "CLUB_ADMIN" || user.role === "DELIVERY") && user.clubId === club.id;
}

export type SheetInput = {
  status: ClubSheetStatus; balancePaid: number; paidAt?: Date | null; method?: string | null; reference?: string | null;
  deliveredAt?: Date | null; deliveredTo?: string | null; notes?: string | null;
};

export async function saveSheet(user: SessionUser, actor: Actor, orderId: string, i: SheetInput) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { club: true } });
  if (!o) throw new OrderError("Pedido inexistente.");
  if (!canEditSheet(user, o.club)) throw new OrderError("La planilla de gestión no está habilitada para tu usuario.");
  if (o.pricingModel !== "TEXTIL_ADVANCE") throw new OrderError("La planilla es para pedidos con anticipo textil.");
  if (o.status !== "CONFIRMED") throw new OrderError("Solo pedidos confirmados (con anticipo aprobado).");
  if (!Number.isInteger(i.balancePaid) || i.balancePaid < 0) throw new OrderError("Importe inválido.");
  if (i.status === "DELIVERED" && !i.deliveredTo?.trim()) throw new OrderError("Anotá quién retiró.");
  const data = {
    status: i.status, balancePaid: i.balancePaid, paidAt: i.paidAt ?? null, method: i.method?.trim() || null, reference: i.reference?.trim() || null,
    deliveredAt: i.deliveredAt ?? (i.status === "DELIVERED" ? new Date() : null), deliveredTo: i.deliveredTo?.trim() || null, notes: i.notes?.trim() || null,
    updatedById: user.id,
  };
  const prev = await db.clubOrderSheet.findUnique({ where: { orderId } });
  const s = await db.clubOrderSheet.upsert({ where: { orderId }, create: { ...data, orderId, clubId: o.clubId }, update: data });
  // Se registra quién cargó qué (valor anterior y nuevo); no se toca el pedido
  const { updatedById: _u, ...tracked } = data;
  const d = diffFields((prev ?? {}) as Record<string, unknown>, tracked);
  await audit(actor, { entity: "ClubOrderSheet", entityId: s.id, clubId: o.clubId, action: "clubsheet.updated", data: { order: o.code }, before: d.before, after: d.after });
  return s;
}

/** Filas de la planilla: lo que se compró, quién, y la etapa del sistema (lectura) + lo que anota el club. */
export async function sheetRows(clubId: string, campaignId?: string) {
  const orders = await db.order.findMany({
    where: { clubId, pricingModel: "TEXTIL_ADVANCE", status: "CONFIRMED", ...(campaignId ? { campaignId } : {}) },
    orderBy: [{ campaignId: "asc" }, { buyerName: "asc" }],
    include: {
      campaign: { select: { title: true } },
      clubSheet: true,
      units: {
        where: { status: "ACTIVE" }, orderBy: { sort: "asc" },
        include: { player: true, components: true, lotUnits: { include: { lot: { select: { status: true } } } } },
      },
    },
  });
  return orders.map((o) => ({
    id: o.id, code: o.code, pickupCode: o.pickupCode, campaign: o.campaign.title, buyer: o.buyerName, phone: o.buyerPhone, email: o.buyerEmail,
    clubBalance: o.clubBalanceRequired, stage: systemStage(o), sheet: o.clubSheet,
    units: o.units.map((u) => ({
      ref: u.ref, product: u.productName, player: u.player?.name ?? null, category: u.player?.category ?? null,
      sizes: u.components.map((c) => `${c.label} ${c.sizeLabel}`).join(" · "),
      pers: [u.legend, u.persName, u.persNumber && `N° ${u.persNumber}`].filter(Boolean).join(" · "),
    })),
  }));
}
export type SheetRow = Awaited<ReturnType<typeof sheetRows>>[number];
