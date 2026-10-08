import "server-only";
import { db } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { OrderError } from "@/modules/orders/pricing";
import type { PurchasePurpose, SampleAvailability, SampleKind } from "@/generated/prisma/client";

/**
 * Muestrario de talles y compras del club.
 * - Las curvas (superior/inferior) son prendas de referencia para probarse en el club.
 * - La equivalencia producto–curva la aprueba la textil por producto: sin aprobación, no se anuncia.
 * - Muestrario, compra inicial y respaldo son funciones distintas; una compra puede cumplir más de una
 *   solo si se marca explícitamente. La distribución de talles del respaldo es manual.
 */

export const SAMPLE_KIND_LABEL: Record<SampleKind, string> = { TOP: "Prendas superiores", BOTTOM: "Prendas inferiores", OTHER: "Otra" };
export const SAMPLE_AVAILABILITY_LABEL: Record<SampleAvailability, string> = { PENDING_DELIVERY: "Pendiente de entrega", AVAILABLE: "Disponible en el club", NOT_AVAILABLE: "No disponible" };
export const PURPOSE_LABEL: Record<PurchasePurpose, string> = { SAMPLE: "Muestrario", INITIAL: "Compra inicial", BACKUP: "Respaldo para cambios" };
/** Texto público, solo si el producto tiene una curva aprobada y disponible. */
export const SAMPLE_PUBLIC_TEXT = "Podés probarte el muestrario en el club antes de elegir tu talle.";

type SizeQty = { sizeLabel: string; quantity: number };
function cleanSizes(items: SizeQty[]) {
  const out = items.map((i) => ({ sizeLabel: i.sizeLabel.trim().toUpperCase(), quantity: i.quantity })).filter((i) => i.sizeLabel && i.quantity > 0);
  if (new Set(out.map((i) => i.sizeLabel)).size !== out.length) throw new OrderError("Hay talles repetidos.");
  if (out.some((i) => !Number.isInteger(i.quantity) || i.quantity > 1000)) throw new OrderError("Cantidad inválida.");
  return out;
}

export type SampleSetInput = {
  kind: SampleKind; name: string; referenceGarmentId?: string | null; deliveredAt?: Date | null; availability: SampleAvailability;
  location?: string | null; notes?: string | null; purchaseId?: string | null; items: SizeQty[];
};

export async function saveSampleSet(actor: Actor, clubId: string, id: string | null, i: SampleSetInput) {
  if (i.name.trim().length < 2) throw new OrderError("Poné un nombre a la curva (ej. Curva superior 1).");
  const items = cleanSizes(i.items);
  if (!items.length) throw new OrderError("Cargá al menos un talle de la curva.");
  if (i.availability === "AVAILABLE" && !i.location?.trim()) throw new OrderError("Indicá dónde se puede probar el muestrario.");
  if (i.referenceGarmentId && !(await db.garment.findFirst({ where: { id: i.referenceGarmentId, clubId } }))) throw new OrderError("La prenda de referencia no es de este club.");
  if (i.purchaseId) {
    const p = await db.clubPurchase.findFirst({ where: { id: i.purchaseId, clubId } });
    if (!p || !p.purposes.includes("SAMPLE")) throw new OrderError("La compra vinculada no está marcada como muestrario.");
  }
  const data = {
    kind: i.kind, name: i.name.trim(), referenceGarmentId: i.referenceGarmentId || null, deliveredAt: i.deliveredAt ?? null, availability: i.availability,
    location: i.location?.trim() || null, notes: i.notes?.trim() || null, purchaseId: i.purchaseId || null,
  };
  const set = await db.$transaction(async (tx) => {
    const s = id ? await tx.sizeSampleSet.update({ where: { id, clubId }, data }) : await tx.sizeSampleSet.create({ data: { ...data, clubId } });
    await tx.sizeSampleItem.deleteMany({ where: { setId: s.id } });
    await tx.sizeSampleItem.createMany({ data: items.map((it, n) => ({ ...it, setId: s.id, sort: n })) });
    return s;
  });
  await audit(actor, { entity: "SizeSampleSet", entityId: set.id, clubId, action: id ? "samples.updated" : "samples.created", data: { kind: i.kind, sizes: items.length, availability: i.availability } });
  return set;
}

/** La textil aprueba (o retira) que un producto se pruebe con una curva. */
export async function setProductSampleLink(actor: Actor & { id: string; role: string }, productId: string, setId: string, approved: boolean, notes?: string) {
  if (actor.role !== "TEXTIL_ADMIN") throw new OrderError("La equivalencia de calce la aprueba la textil.");
  const [p, s] = await Promise.all([db.product.findUnique({ where: { id: productId } }), db.sizeSampleSet.findUnique({ where: { id: setId } })]);
  if (!p || !s || p.clubId !== s.clubId) throw new OrderError("Producto o curva inválidos.");
  await db.productSampleLink.upsert({
    where: { productId_setId: { productId, setId } },
    create: { productId, setId, approved, approvedAt: approved ? new Date() : null, approvedById: approved ? actor.id : null, notes: notes?.trim() || null },
    update: { approved, approvedAt: approved ? new Date() : null, approvedById: approved ? actor.id : null, notes: notes?.trim() || null },
  });
  await audit(actor, { entity: "Product", entityId: productId, clubId: p.clubId, action: "samples.link", data: { setId, approved } });
}

/** Curvas aprobadas y disponibles por producto (para la tienda). */
export async function sampleInfoForProducts(productIds: string[]) {
  const links = await db.productSampleLink.findMany({
    where: { productId: { in: productIds }, approved: true, set: { availability: "AVAILABLE" } },
    include: { set: { include: { items: { orderBy: { sort: "asc" } } } } },
  });
  const by = new Map<string, { kind: SampleKind; location: string | null; sizes: string[] }[]>();
  for (const l of links) {
    const arr = by.get(l.productId) ?? [];
    arr.push({ kind: l.set.kind, location: l.set.location, sizes: l.set.items.map((i) => i.sizeLabel) });
    by.set(l.productId, arr);
  }
  return by;
}

export type PurchaseInput = {
  productId?: string | null; campaignId?: string | null; purposes: PurchasePurpose[]; committedQty: number; paidQty: number;
  paidAmount?: number | null; items: SizeQty[]; notes?: string | null;
};

/**
 * Compra del club (muestrario, compra inicial o respaldo). La distribución de talles se carga a mano;
 * queda "definida" solo si suma exactamente lo comprometido. Cualquier cambio retira la aprobación.
 */
export async function savePurchase(actor: Actor & { id: string }, clubId: string, id: string | null, i: PurchaseInput) {
  if (!i.purposes.length) throw new OrderError("Marcá para qué es la compra (muestrario, compra inicial o respaldo).");
  if (!Number.isInteger(i.committedQty) || i.committedQty < 1) throw new OrderError("Indicá la cantidad comprometida.");
  if (!Number.isInteger(i.paidQty) || i.paidQty < 0 || i.paidQty > i.committedQty) throw new OrderError("Las unidades pagadas no pueden superar las comprometidas.");
  if (i.productId && !(await db.product.findFirst({ where: { id: i.productId, clubId } }))) throw new OrderError("El producto no es de este club.");
  if (i.campaignId && !(await db.campaign.findFirst({ where: { id: i.campaignId, clubId } }))) throw new OrderError("La campaña no es de este club.");
  const items = cleanSizes(i.items);
  const sum = items.reduce((a, it) => a + it.quantity, 0);
  if (sum > i.committedQty) throw new OrderError(`La distribución de talles (${sum}) supera lo comprometido (${i.committedQty}).`);
  const sizeStatus = items.length && sum === i.committedQty ? "DEFINED" : "PENDING";
  const data = {
    productId: i.productId || null, campaignId: i.campaignId || null, purposes: [...new Set(i.purposes)], committedQty: i.committedQty, paidQty: i.paidQty,
    paidAmount: i.paidAmount ?? null, notes: i.notes?.trim() || null, sizeStatus: sizeStatus as "DEFINED" | "PENDING", approvedAt: null, approvedById: null,
  };
  const p = await db.$transaction(async (tx) => {
    const r = id ? await tx.clubPurchase.update({ where: { id, clubId }, data }) : await tx.clubPurchase.create({ data: { ...data, clubId, createdById: actor.id } });
    await tx.clubPurchaseItem.deleteMany({ where: { purchaseId: r.id } });
    if (items.length) await tx.clubPurchaseItem.createMany({ data: items.map((it) => ({ ...it, purchaseId: r.id })) });
    return r;
  });
  await audit(actor, { entity: "ClubPurchase", entityId: p.id, clubId, action: id ? "purchase.updated" : "purchase.created", data: { purposes: data.purposes, committed: i.committedQty, paid: i.paidQty, sizeStatus } });
  return p;
}

export async function approvePurchase(actor: Actor & { id: string; role: string }, purchaseId: string) {
  if (actor.role !== "TEXTIL_ADMIN") throw new OrderError("La compra la aprueba la textil.");
  const p = await db.clubPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  if (p.sizeStatus !== "DEFINED") throw new OrderError("Falta la distribución de talles completa.");
  await db.clubPurchase.update({ where: { id: purchaseId }, data: { approvedAt: new Date(), approvedById: actor.id } });
  await audit(actor, { entity: "ClubPurchase", entityId: purchaseId, clubId: p.clubId, action: "purchase.approved" });
}

/**
 * Referencia para el respaldo: distribución de talles de los pedidos confirmados del producto.
 * Es solo información: el respaldo se define a mano, nunca se calcula solo.
 */
export async function orderSizeReference(productId: string) {
  const comps = await db.orderUnitComponent.groupBy({
    by: ["garmentCode", "sizeLabel"],
    where: { unit: { productId, status: "ACTIVE", order: { status: "CONFIRMED" } } },
    _count: { _all: true },
  });
  return comps.map((c) => ({ garment: c.garmentCode, size: c.sizeLabel, qty: c._count._all }));
}
