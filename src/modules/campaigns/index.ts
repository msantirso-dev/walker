import "server-only";
import { db } from "@/shared/db";
import { audit, SYSTEM, type Actor } from "@/modules/audit";
import { OrderError } from "@/modules/orders/pricing";
import type { CampaignStatus, MinDecision } from "@/generated/prisma/client";
import { activationProblems, syncCatalogStatus, campaignProductIds } from "./rules";

export * from "./rules";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Borrador",
  ACTIVATION_REQUESTED: "Activación solicitada",
  ACTIVATION_APPROVED: "Activación aprobada",
  PUBLISHED: "Publicada",
  CLOSED: "Cerrada",
  IN_PRODUCTION: "En producción",
  READY_FOR_PICKUP: "Lista para retiro",
  FINISHED: "Finalizada",
  CANCELLED: "Cancelada",
};

export const MIN_DECISION_LABEL: Record<MinDecision, string> = { EXTEND: "Extender la preventa", CANCEL: "Cancelar la campaña", CONTINUE: "Continuar con la producción" };

/** Estado efectivo: una campaña publicada cuya fecha de cierre pasó se considera cerrada. */
export function effectiveStatus(c: { status: CampaignStatus; closesAt: Date; opensAt: Date }, now = new Date()): CampaignStatus | "SCHEDULED" {
  if (c.status === "PUBLISHED" && now >= c.closesAt) return "CLOSED";
  if (c.status === "PUBLISHED" && now < c.opensAt) return "SCHEDULED";
  return c.status;
}

/** Cierra campañas publicadas vencidas (tarea programada). */
export async function closeExpiredCampaigns() {
  const now = new Date();
  const due = await db.campaign.findMany({ where: { status: "PUBLISHED", closesAt: { lte: now } }, select: { id: true, clubId: true } });
  for (const c of due) {
    await db.campaign.update({ where: { id: c.id }, data: { status: "CLOSED" } });
    await syncCatalogStatus(await campaignProductIds(c.id));
    await audit(SYSTEM, { entity: "Campaign", entityId: c.id, clubId: c.clubId, action: "campaign.closed_by_date" });
  }
  return due.length;
}

export async function publishCampaign(actor: Actor, id: string) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id }, include: { products: { where: { active: true } } } });
  if (c.pricingModel === "TEXTIL_ADVANCE") {
    if (c.status !== "ACTIVATION_APPROVED") throw new OrderError("La campaña necesita la autorización de la textil antes de publicarse.");
    const problems = await activationProblems(id);
    if (problems.length) throw new OrderError(`No se puede publicar: ${problems[0]}`);
  } else if (c.status !== "DRAFT") throw new OrderError("Solo se publica una campaña en borrador.");
  if (!c.products.length) throw new OrderError("Agregá al menos un producto a la colección antes de publicar.");
  if (c.closesAt <= c.opensAt) throw new OrderError("La fecha de cierre debe ser posterior a la apertura.");
  if (c.closesAt <= new Date()) throw new OrderError("La fecha de cierre ya pasó.");
  if (!c.allowMercadoPago && !c.allowTransfer) throw new OrderError("Habilitá al menos un medio de pago.");
  await db.campaign.update({ where: { id }, data: { status: "PUBLISHED" } });
  await syncCatalogStatus(c.products.map((p) => p.productId));
  await audit(actor, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.published" });
}

export async function closeCampaign(actor: Actor, id: string) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id } });
  if (c.status !== "PUBLISHED") throw new OrderError("La campaña no está publicada.");
  const now = new Date();
  await db.campaign.update({ where: { id }, data: { status: "CLOSED", closesAt: c.closesAt > now ? now : c.closesAt } });
  await syncCatalogStatus(await campaignProductIds(id));
  await audit(actor, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.closed" });
}

export async function finishCampaign(actor: Actor, id: string) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id } });
  if (c.status !== "READY_FOR_PICKUP") throw new OrderError("La campaña debe estar lista para retiro.");
  await db.campaign.update({ where: { id }, data: { status: "FINISHED" } });
  await audit(actor, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.finished" });
}

/** Cancelar la campaña no cancela pedidos ni devuelve dinero: eso se registra pedido por pedido. */
export async function cancelCampaign(actor: Actor, id: string, reason: string) {
  if (reason.trim().length < 5) throw new OrderError("Indicá el motivo de la cancelación.");
  const c = await db.campaign.findUniqueOrThrow({ where: { id } });
  if (["FINISHED", "CANCELLED"].includes(c.status)) throw new OrderError("La campaña ya está finalizada o cancelada.");
  await db.campaign.update({ where: { id }, data: { status: "CANCELLED" } });
  await syncCatalogStatus(await campaignProductIds(id));
  await audit(actor, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.cancelled", data: { reason: reason.trim() } });
}

/** Decisión administrativa explícita cuando no se alcanza el mínimo. */
export async function decideMinimum(actor: Actor & { id: string }, id: string, decision: MinDecision, note: string, newCloseAt?: Date | null) {
  if (note.trim().length < 5) throw new OrderError("Explicá la decisión: se registra y se informa.");
  const c = await db.campaign.findUniqueOrThrow({ where: { id } });
  if (!c.minUnits) throw new OrderError("La campaña no tiene mínimo de producción.");
  if (!["PUBLISHED", "CLOSED"].includes(c.status)) throw new OrderError("La decisión se toma con la campaña publicada o cerrada.");
  const data: Record<string, unknown> = { minDecision: decision, minDecisionNote: note.trim(), minDecisionAt: new Date(), minDecisionById: actor.id };
  if (decision === "EXTEND") {
    if (!newCloseAt || newCloseAt <= new Date()) throw new OrderError("Para extender, indicá una nueva fecha de cierre futura.");
    data.closesAt = newCloseAt;
    data.status = "PUBLISHED";
  }
  if (decision === "CANCEL") data.status = "CANCELLED";
  await db.campaign.update({ where: { id }, data });
  await audit(actor, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.min_decision", data: { decision, note: note.trim(), newCloseAt: newCloseAt?.toISOString() ?? null } });
}

/** Métricas de una campaña (o de varias, si se pasa un filtro por club). */
export async function campaignMetrics(campaignId: string) {
  const [orders, units, components, players, inLots, settlements, cancelledUnits] = await Promise.all([
    db.order.findMany({
      where: { campaignId },
      select: { status: true, total: true, paidAmount: true, inReviewAmount: true, depositRequired: true, deliveryStatus: true, refundedAmount: true, pricingModel: true, advanceRequired: true, advancePaid: true, clubBalanceRequired: true, clubPaid: true },
    }),
    db.orderUnit.findMany({
      where: { status: "ACTIVE", order: { campaignId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } } },
      select: { productId: true, productName: true, productCode: true, benefitAmount: true, unitPrice: true, order: { select: { status: true } }, player: { select: { sport: true, category: true } } },
    }),
    db.orderUnitComponent.findMany({
      where: { unit: { status: "ACTIVE", order: { campaignId, status: "CONFIRMED" } } },
      select: { garmentCode: true, garmentName: true, sizeLabel: true, garmentId: true },
    }),
    db.player.count({ where: { order: { campaignId, status: "CONFIRMED" } } }),
    db.productionLotUnit.aggregate({ where: { lot: { campaignId, status: { not: "PENDING_APPROVAL" } } }, _sum: { delta: true } }),
    db.benefitSettlement.aggregate({ where: { campaignId }, _sum: { amount: true } }),
    db.orderUnit.findMany({ where: { status: "CANCELLED", order: { campaignId, confirmedAt: { not: null } } }, select: { benefitAmount: true } }),
  ]);

  const confirmed = orders.filter((o) => o.status === "CONFIRMED");
  const unitsConfirmed = units.filter((u) => u.order.status === "CONFIRMED");
  const byProduct = new Map<string, { name: string; code: string; requested: number; confirmed: number }>();
  for (const u of units) {
    const r = byProduct.get(u.productId) ?? { name: u.productName, code: u.productCode, requested: 0, confirmed: 0 };
    r.requested++;
    if (u.order.status === "CONFIRMED") r.confirmed++;
    byProduct.set(u.productId, r);
  }
  const sizeSorts = await db.garmentSize.findMany({ where: { garmentId: { in: [...new Set(components.map((c) => c.garmentId))] } }, select: { garmentId: true, label: true, sort: true } });
  const sortOf = new Map(sizeSorts.map((s) => [`${s.garmentId}|${s.label}`, s.sort]));
  const bySize = new Map<string, { garment: string; code: string; size: string; sort: number; qty: number }>();
  for (const c of components) {
    const k = `${c.garmentCode}|${c.sizeLabel}`;
    const r = bySize.get(k) ?? { garment: c.garmentName, code: c.garmentCode, size: c.sizeLabel, sort: sortOf.get(`${c.garmentId}|${c.sizeLabel}`) ?? 999, qty: 0 };
    r.qty++;
    bySize.set(k, r);
  }
  const byCategory = new Map<string, number>();
  for (const u of unitsConfirmed) {
    const k = u.player ? `${u.player.sport ?? "Sin deporte"} · ${u.player.category ?? "Sin categoría"}` : "Sin jugador (socio o hincha)";
    byCategory.set(k, (byCategory.get(k) ?? 0) + 1);
  }

  const benefitEstimated = unitsConfirmed.reduce((a, u) => a + u.benefitAmount, 0);
  return {
    orders: orders.length,
    ordersConfirmed: confirmed.length,
    ordersPending: orders.filter((o) => o.status === "PENDING_PAYMENT").length,
    ordersInReview: orders.filter((o) => o.inReviewAmount > 0).length,
    ordersDepositOnly: confirmed.filter((o) => o.paidAmount < o.total).length,
    ordersReady: confirmed.filter((o) => o.deliveryStatus === "READY" || o.deliveryStatus === "PARTIAL").length,
    ordersDelivered: confirmed.filter((o) => o.deliveryStatus === "DELIVERED").length,
    unitsRequested: units.length,
    unitsConfirmed: unitsConfirmed.length,
    unitsInLots: inLots._sum.delta ?? 0,
    playersConfirmed: players,
    collected: orders.reduce((a, o) => a + o.paidAmount, 0),
    inReview: orders.reduce((a, o) => a + o.inReviewAmount, 0),
    balanceDue: confirmed.reduce((a, o) => a + Math.max(0, o.total - o.paidAmount), 0),
    salesConfirmed: confirmed.reduce((a, o) => a + o.total, 0),
    advanceCollected: orders.reduce((a, o) => a + o.advancePaid, 0),
    clubCollected: orders.reduce((a, o) => a + o.clubPaid, 0),
    clubBalanceDue: confirmed.filter((o) => o.pricingModel === "TEXTIL_ADVANCE").reduce((a, o) => a + Math.max(0, o.clubBalanceRequired - o.clubPaid), 0),
    ordersClubPending: confirmed.filter((o) => o.pricingModel === "TEXTIL_ADVANCE" && o.clubPaid < o.clubBalanceRequired).length,
    refundPending: orders.filter((o) => o.status === "CANCELLED").reduce((a, o) => a + o.paidAmount, 0),
    byProduct: [...byProduct.values()].sort((a, b) => b.confirmed - a.confirmed),
    bySize: [...bySize.values()].sort((a, b) => a.code.localeCompare(b.code) || a.sort - b.sort),
    byCategory: [...byCategory.entries()].map(([label, qty]) => ({ label, qty })).sort((a, b) => b.qty - a.qty),
    benefit: {
      estimated: benefitEstimated,
      adjustments: cancelledUnits.reduce((a, u) => a + u.benefitAmount, 0),
      settled: settlements._sum.amount ?? 0,
    },
  };
}

export type CampaignMetrics = Awaited<ReturnType<typeof campaignMetrics>>;
