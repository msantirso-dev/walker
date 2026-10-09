import "server-only";
import { db } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { OrderError } from "@/modules/orders/pricing";
import { getBrand } from "@/modules/brand";
import type { AdditionalReason, DebtBlockScope } from "@/generated/prisma/client";
import type { SessionUser } from "@/modules/auth";

/**
 * Compra adicional del club posterior al cierre (ventas fuera de término, boutique, cambios de talle).
 * La negocian empresa y club fuera de la web; la empresa la registra. Son unidades del club: no se atribuyen
 * a socios ni se suman a las ventas públicas. Se incorporan a producción con una revisión aprobada (lote de ajuste)
 * y no se liberan mientras estén impagas.
 */
export const REASON_LABEL: Record<AdditionalReason, string> = { LATE_SALES: "Ventas fuera de término", BOUTIQUE: "Disponibilidad en boutique", SIZE_CHANGES: "Eventuales cambios de talle", OTHER: "Otro" };

export type AdditionalInput = {
  reasons: AdditionalReason[];
  items: { productId: string; sizeLabel: string; quantity: number; unitPrice: number }[];
  dueAt: Date | null;
  notes?: string | null;
};

function assertCompany(user: SessionUser) {
  if (user.role !== "TEXTIL_ADMIN") throw new OrderError("Las compras adicionales las registra la empresa.");
}

export async function createAdditionalPurchase(user: SessionUser, actor: Actor, campaignId: string, i: AdditionalInput) {
  assertCompany(user);
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { products: { select: { productId: true } } } });
  if (c.closesAt > new Date() && c.status === "PUBLISHED") throw new OrderError("La compra adicional se registra después del cierre de la preventa.");
  if (!i.reasons.length) throw new OrderError("Indicá el motivo de la compra.");
  const items = i.items.filter((x) => x.quantity > 0);
  if (!items.length) throw new OrderError("Cargá al menos un producto, talle y cantidad.");
  const allowed = new Set(c.products.map((p) => p.productId));
  for (const it of items) {
    if (!allowed.has(it.productId)) throw new OrderError("Hay un producto que no pertenece a la campaña.");
    if (!Number.isInteger(it.quantity) || it.quantity > 1000) throw new OrderError("Cantidad inválida.");
    if (!Number.isInteger(it.unitPrice) || it.unitPrice < 0) throw new OrderError("Precio acordado inválido.");
    if (!it.sizeLabel.trim()) throw new OrderError("Indicá el talle de cada renglón.");
  }
  const agreedAmount = items.reduce((a, it) => a + it.quantity * it.unitPrice, 0);
  const committedQty = items.reduce((a, it) => a + it.quantity, 0);
  const p = await db.clubPurchase.create({
    data: {
      clubId: c.clubId, campaignId, purposes: ["ADDITIONAL"], reasons: [...new Set(i.reasons)], committedQty, paidQty: 0, agreedAmount, dueAt: i.dueAt,
      sizeStatus: "DEFINED", notes: i.notes?.trim() || null, createdById: user.id,
      items: { create: items.map((it) => ({ productId: it.productId, sizeLabel: it.sizeLabel.trim().toUpperCase(), quantity: it.quantity, unitPrice: it.unitPrice })) },
    },
  });
  await audit(actor, { entity: "ClubPurchase", entityId: p.id, clubId: c.clubId, action: "purchase.additional_created", after: { reasons: i.reasons, units: committedQty, agreedAmount, dueAt: i.dueAt?.toISOString() ?? null } });
  return p;
}

export async function registerPurchasePayment(user: SessionUser, actor: Actor, purchaseId: string, i: { amount: number; paidAt: Date; method: string; reference?: string | null; notes?: string | null }) {
  assertCompany(user);
  const p = await db.clubPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { payments: true } });
  if (!Number.isInteger(i.amount) || i.amount <= 0) throw new OrderError("Importe inválido.");
  if (!i.method.trim()) throw new OrderError("Indicá el medio de pago.");
  const paid = p.payments.reduce((a, x) => a + x.amount, 0);
  if (p.agreedAmount != null && paid + i.amount > p.agreedAmount) throw new OrderError("El pago supera el importe acordado.");
  const pay = await db.clubPurchasePayment.create({ data: { purchaseId, amount: i.amount, paidAt: i.paidAt, method: i.method.trim(), reference: i.reference?.trim() || null, notes: i.notes?.trim() || null, createdById: user.id } });
  await db.clubPurchase.update({ where: { id: purchaseId }, data: { paidAmount: paid + i.amount } });
  await audit(actor, { entity: "ClubPurchase", entityId: purchaseId, clubId: p.clubId, action: "purchase.payment", before: { paid }, after: { paid: paid + i.amount, method: i.method, reference: i.reference ?? null } });
  return pay;
}

/** Deuda de una compra: acordado − pagado. */
export function purchaseDebt(p: { agreedAmount: number | null; payments: { amount: number }[] }) {
  return Math.max(0, (p.agreedAmount ?? 0) - p.payments.reduce((a, x) => a + x.amount, 0));
}

/**
 * Revisión del lote: incorpora las unidades de una compra aprobada en un lote de ajuste nuevo (el lote original
 * no se modifica). El lote de ajuste se aprueba como cualquier lote.
 */
export async function addPurchaseToProduction(user: SessionUser, actor: Actor & { id: string }, purchaseId: string) {
  assertCompany(user);
  return db.$transaction(async (tx) => {
    const p = await tx.clubPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { items: { include: { lotItems: true } } } });
    if (!p.campaignId) throw new OrderError("La compra no está asociada a una campaña.");
    if (!p.approvedAt) throw new OrderError("Aprobá la compra antes de sumarla a producción.");
    const pending = p.items.filter((it) => it.lotItems.reduce((a, l) => a + l.quantity, 0) < it.quantity);
    if (!pending.length) throw new OrderError("Las unidades de esta compra ya están en un lote.");
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${p.campaignId} FOR UPDATE`;
    const last = await tx.productionLot.findFirst({ where: { campaignId: p.campaignId }, orderBy: { number: "desc" }, select: { number: true } });
    const lot = await tx.productionLot.create({
      data: { campaignId: p.campaignId, number: (last?.number ?? 0) + 1, kind: "ADJUSTMENT", notes: `Revisión: compra adicional del club ${p.id.slice(-6).toUpperCase()}`, createdById: actor.id },
    });
    for (const it of pending) {
      const done = it.lotItems.reduce((a, l) => a + l.quantity, 0);
      await tx.productionLotPurchaseItem.create({ data: { lotId: lot.id, purchaseItemId: it.id, quantity: it.quantity - done } });
    }
    await audit(actor, { entity: "ProductionLot", entityId: lot.id, clubId: p.clubId, action: "lot.revision_purchase", data: { purchaseId, number: lot.number } }, tx);
    return lot;
  });
}

/** Alcance del bloqueo por deuda para el club: configuración del club o, si no tiene, la de la marca. */
export async function debtBlockScope(clubId: string): Promise<DebtBlockScope> {
  const club = await db.club.findUniqueOrThrow({ where: { id: clubId }, select: { debtBlockScope: true } });
  return club.debtBlockScope ?? (await getBrand()).debtBlockDefault;
}

/**
 * ¿Se puede despachar? Las unidades adicionales impagas no se liberan. Con bloqueo de todo el despacho,
 * cualquier compra adicional impaga del club detiene el envío completo.
 */
export async function assertDispatchAllowed(clubId: string, lotIds: string[]) {
  const scope = await debtBlockScope(clubId);
  const unpaid = await db.clubPurchase.findMany({
    where: { clubId, purposes: { has: "ADDITIONAL" } },
    include: { payments: true, items: { include: { lotItems: { select: { lotId: true } } } } },
  });
  const owing = unpaid.filter((p) => purchaseDebt(p) > 0);
  if (!owing.length) return;
  if (scope === "WHOLE_SHIPMENT") throw new OrderError("El club tiene compras adicionales impagas: no se despacha hasta que estén canceladas (bloqueo de todo el despacho).");
  const blocked = owing.some((p) => p.items.some((it) => it.lotItems.some((l) => lotIds.includes(l.lotId))));
  if (blocked) throw new OrderError("Las unidades adicionales del club no se liberan hasta que estén pagas. Registrá el pago o quitá ese lote del despacho.");
}

export async function additionalPurchases(campaignId: string) {
  return db.clubPurchase.findMany({
    where: { campaignId, purposes: { has: "ADDITIONAL" } },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { product: { select: { code: true, name: true } }, lotItems: { include: { lot: { select: { number: true, status: true } } } } } }, payments: { orderBy: { paidAt: "asc" } } },
  });
}
