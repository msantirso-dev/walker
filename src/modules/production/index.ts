import "server-only";
import { db, type Tx } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { queueEmail, orderMailSelect } from "@/modules/notifications";
import { OrderError } from "@/modules/orders/pricing";
import type { LotStatus, Prisma } from "@/generated/prisma/client";

export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  PENDING_APPROVAL: "Pendiente de aprobación",
  APPROVED: "Aprobado",
  IN_PRODUCTION: "En producción",
  QUALITY_CONTROL: "Control de calidad",
  READY_TO_SHIP: "Listo para despacho",
  RECEIVED_BY_CLUB: "Recibido por el club",
};

/** Texto que ve el comprador según el estado del lote que contiene sus prendas. */
export const LOT_PUBLIC_LABEL: Record<LotStatus, string> = {
  PENDING_APPROVAL: "Pedido consolidado, a la espera de enviarse a fábrica",
  APPROVED: "Orden enviada a fábrica",
  IN_PRODUCTION: "En producción",
  QUALITY_CONTROL: "En control de calidad",
  READY_TO_SHIP: "Lista para despacho al club",
  RECEIVED_BY_CLUB: "Disponible en el club",
};

const FLOW: LotStatus[] = ["PENDING_APPROVAL", "APPROVED", "IN_PRODUCTION", "QUALITY_CONTROL", "READY_TO_SHIP", "RECEIVED_BY_CLUB"];
export const nextLotStatus = (s: LotStatus): LotStatus | null => FLOW[FLOW.indexOf(s) + 1] ?? null;

/** Unidades con su inclusión neta en lotes (aprobados o pendientes). */
async function netInclusion(tx: Tx, campaignId: string) {
  const rows = await tx.productionLotUnit.findMany({ where: { lot: { campaignId } }, select: { unitId: true, delta: true, lot: { select: { status: true } } } });
  const committed = new Map<string, number>();
  for (const r of rows) if (r.lot.status !== "PENDING_APPROVAL") committed.set(r.unitId, (committed.get(r.unitId) ?? 0) + r.delta);
  return committed;
}

/**
 * Genera (o regenera) el lote pendiente con los cambios respecto de lo ya aprobado:
 * altas de unidades que cumplen la condición de pago y bajas de unidades canceladas.
 */
export async function generateLot(actor: Actor & { id: string }, campaignId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    if (["DRAFT", "CANCELLED"].includes(c.status)) throw new OrderError("La campaña no está en condiciones de generar un lote.");
    if (c.status === "PUBLISHED" && c.closesAt > new Date()) throw new OrderError("La ventana de compra sigue abierta. Cerrá la campaña antes de consolidar.");

    const confirmedUnits = await tx.orderUnit.count({ where: { status: "ACTIVE", order: { campaignId, status: "CONFIRMED" } } });
    if (c.minUnits && confirmedUnits < c.minUnits && c.minDecision !== "CONTINUE") {
      throw new OrderError(`No se alcanzó el mínimo (${confirmedUnits} de ${c.minUnits}). Registrá la decisión "continuar" antes de consolidar.`);
    }

    const committed = await netInclusion(tx, campaignId);
    const payWhere: Prisma.OrderWhereInput =
      c.lotCondition === "FULLY_PAID"
        ? { campaignId, status: "CONFIRMED", paidAmount: { gte: tx.order.fields.total } }
        : { campaignId, status: "CONFIRMED" };
    const eligible = await tx.orderUnit.findMany({ where: { status: "ACTIVE", order: payWhere }, select: { id: true } });
    const adds = eligible.filter((u) => (committed.get(u.id) ?? 0) === 0).map((u) => ({ unitId: u.id, delta: 1 }));
    const eligibleSet = new Set(eligible.map((u) => u.id));
    const removes = [...committed.entries()].filter(([id, n]) => n > 0 && !eligibleSet.has(id)).map(([unitId]) => ({ unitId, delta: -1 }));

    const pending = await tx.productionLot.findFirst({ where: { campaignId, status: "PENDING_APPROVAL" } });
    if (!adds.length && !removes.length) {
      if (pending) await tx.productionLot.delete({ where: { id: pending.id } });
      throw new OrderError("No hay unidades nuevas ni bajas respecto de los lotes aprobados.");
    }
    const anyApproved = await tx.productionLot.count({ where: { campaignId, status: { not: "PENDING_APPROVAL" } } });
    let lot = pending;
    if (lot) {
      await tx.productionLotUnit.deleteMany({ where: { lotId: lot.id } });
    } else {
      const last = await tx.productionLot.findFirst({ where: { campaignId }, orderBy: { number: "desc" } });
      lot = await tx.productionLot.create({
        data: { campaignId, number: (last?.number ?? 0) + 1, kind: anyApproved ? "ADJUSTMENT" : "MAIN", createdById: actor.id },
      });
    }
    await tx.productionLotUnit.createMany({ data: [...adds, ...removes].map((r) => ({ ...r, lotId: lot!.id })) });
    if (c.status === "PUBLISHED") await tx.campaign.update({ where: { id: c.id }, data: { status: "CLOSED" } });
    await audit(actor, { entity: "ProductionLot", entityId: lot.id, clubId: c.clubId, action: "lot.generated", data: { number: lot.number, adds: adds.length, removes: removes.length } }, tx);
    return lot;
  });
}

export type LotLine = { garmentCode: string; garmentName: string; variant: string | null; component: string; product: string; size: string; sizeSort: number; quantity: number };
export type LotPers = { unitRef: string; productCode: string; garmentCode: string; size: string; name: string | null; number: string | null; delta: number };
export type LotBreakdown = { productCode: string; productName: string; component: string; garmentCode: string; size: string; sizeSort: number; quantity: number };
export type LotReport = { club: string; campaign: string; lotNumber: number; kind: string; status: string; generatedAt: string; lines: LotLine[]; breakdown: LotBreakdown[]; garments: { code: string; name: string; variant: string | null; total: number }[]; personalization: LotPers[]; totalUnits: number };

/** Consolidado por prenda fabricable y talle. Los componentes de conjuntos y combos se suman con las prendas sueltas del mismo código. */
export async function computeLotReport(lotId: string, tx: Tx = db): Promise<LotReport> {
  const lot = await tx.productionLot.findUniqueOrThrow({
    where: { id: lotId },
    include: {
      campaign: { include: { club: true } },
      units: { include: { unit: { include: { components: true } } } },
    },
  });
  const garmentIds = [...new Set(lot.units.flatMap((u) => u.unit.components.map((c) => c.garmentId)))];
  const sizes = await tx.garmentSize.findMany({ where: { garmentId: { in: garmentIds } } });
  const sortOf = new Map(sizes.map((s) => [`${s.garmentId}|${s.label}`, s.sort]));

  const lines = new Map<string, LotLine>();
  const pers: LotPers[] = [];
  const breakdown = new Map<string, LotBreakdown>();
  for (const lu of lot.units) {
    for (const comp of lu.unit.components) {
      const bk = `${lu.unit.productCode}|${comp.label}|${comp.sizeLabel}`;
      const b = breakdown.get(bk) ?? { productCode: lu.unit.productCode, productName: lu.unit.productName, component: comp.label, garmentCode: comp.garmentCode, size: comp.sizeLabel, sizeSort: sortOf.get(`${comp.garmentId}|${comp.sizeLabel}`) ?? 999, quantity: 0 };
      b.quantity += lu.delta;
      breakdown.set(bk, b);
      const key = `${comp.garmentCode}|${comp.sizeLabel}`;
      const cur = lines.get(key) ?? {
        garmentCode: comp.garmentCode, garmentName: comp.garmentName, variant: comp.variant, component: comp.label,
        product: lu.unit.productCode, size: comp.sizeLabel, sizeSort: sortOf.get(`${comp.garmentId}|${comp.sizeLabel}`) ?? 999, quantity: 0,
      };
      cur.quantity += lu.delta;
      lines.set(key, cur);
    }
    if (lu.unit.persName || lu.unit.persNumber) {
      const target = lu.unit.components.find((c) => c.printTarget) ?? lu.unit.components[0];
      pers.push({ unitRef: lu.unit.ref, productCode: lu.unit.productCode, garmentCode: target.garmentCode, size: target.sizeLabel, name: lu.unit.persName, number: lu.unit.persNumber, delta: lu.delta });
    }
  }
  const sorted = [...lines.values()].filter((l) => l.quantity !== 0).sort((a, b) => a.garmentCode.localeCompare(b.garmentCode) || a.sizeSort - b.sizeSort);
  const garments = new Map<string, { code: string; name: string; variant: string | null; total: number }>();
  for (const l of sorted) {
    const g = garments.get(l.garmentCode) ?? { code: l.garmentCode, name: l.garmentName, variant: l.variant, total: 0 };
    g.total += l.quantity;
    garments.set(l.garmentCode, g);
  }
  pers.sort((a, b) => a.garmentCode.localeCompare(b.garmentCode) || a.size.localeCompare(b.size) || (a.number ?? "").localeCompare(b.number ?? "", undefined, { numeric: true }));
  return {
    club: lot.campaign.club.name,
    campaign: lot.campaign.title,
    lotNumber: lot.number,
    kind: lot.kind,
    status: lot.status,
    generatedAt: lot.createdAt.toISOString(),
    lines: sorted,
    breakdown: [...breakdown.values()].filter((b) => b.quantity !== 0).sort((a, b) => a.productCode.localeCompare(b.productCode) || a.component.localeCompare(b.component) || a.sizeSort - b.sizeSort),
    garments: [...garments.values()],
    personalization: pers,
    totalUnits: lot.units.reduce((a, u) => a + u.delta, 0),
  };
}

/** Reporte del lote: congelado si ya fue aprobado. */
export async function lotReport(lotId: string): Promise<LotReport> {
  const lot = await db.productionLot.findUniqueOrThrow({ where: { id: lotId } });
  if (lot.snapshot) return { ...(lot.snapshot as unknown as LotReport), status: lot.status };
  return computeLotReport(lotId);
}

export async function approveLot(actor: Actor & { id: string }, lotId: string) {
  await db.$transaction(async (tx) => {
    const lot = await tx.productionLot.findUniqueOrThrow({ where: { id: lotId }, include: { campaign: true } });
    if (lot.status !== "PENDING_APPROVAL") throw new OrderError("El lote ya fue aprobado.");
    const snapshot = await computeLotReport(lotId, tx);
    snapshot.status = "APPROVED";
    await tx.productionLot.update({ where: { id: lotId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.id, snapshot: snapshot as unknown as Prisma.InputJsonValue } });
    if (lot.campaign.status === "CLOSED" || lot.campaign.status === "PUBLISHED") await tx.campaign.update({ where: { id: lot.campaignId }, data: { status: "IN_PRODUCTION" } });
    await audit(actor, { entity: "ProductionLot", entityId: lotId, clubId: lot.campaign.clubId, action: "lot.approved", data: { number: lot.number, units: snapshot.totalUnits } }, tx);
  });
}

async function ordersInLot(tx: Tx, lotId: string) {
  const rows = await tx.productionLotUnit.findMany({ where: { lotId, delta: 1 }, select: { unit: { select: { orderId: true } } } });
  return [...new Set(rows.map((r) => r.unit.orderId))];
}

export async function advanceLot(actor: Actor, lotId: string, to: LotStatus) {
  await db.$transaction(async (tx) => {
    const lot = await tx.productionLot.findUniqueOrThrow({ where: { id: lotId }, include: { campaign: true } });
    if (nextLotStatus(lot.status) !== to || to === "APPROVED") throw new OrderError("Cambio de estado no permitido.");
    await tx.productionLot.update({ where: { id: lotId }, data: { status: to } });
    await audit(actor, { entity: "ProductionLot", entityId: lotId, clubId: lot.campaign.clubId, action: "lot.status", data: { from: lot.status, to } }, tx);
    const orderIds = await ordersInLot(tx, lotId);

    if (to === "IN_PRODUCTION") {
      for (const id of orderIds) {
        const sent = await tx.emailOutbox.count({ where: { orderId: id, template: "IN_PRODUCTION" } });
        const o = await tx.order.findUniqueOrThrow({ where: { id }, select: { ...orderMailSelect, status: true } });
        if (!sent && o.status === "CONFIRMED") await queueEmail("IN_PRODUCTION", o, undefined, tx);
      }
    }
    if (to === "RECEIVED_BY_CLUB") {
      for (const id of orderIds) {
        const o = await tx.order.findUniqueOrThrow({ where: { id }, select: { ...orderMailSelect, status: true, deliveryStatus: true } });
        if (o.status !== "CONFIRMED") continue;
        if (o.deliveryStatus === "NOT_READY") await tx.order.update({ where: { id }, data: { deliveryStatus: "READY" } });
        await queueEmail("READY_FOR_PICKUP", o, undefined, tx);
        if (o.total > o.paidAmount) await queueEmail("BALANCE_REQUESTED", o, undefined, tx);
      }
      const open = await tx.productionLot.count({ where: { campaignId: lot.campaignId, status: { not: "RECEIVED_BY_CLUB" } } });
      if (!open && lot.campaign.status !== "FINISHED") await tx.campaign.update({ where: { id: lot.campaignId }, data: { status: "READY_FOR_PICKUP" } });
    }
  });
}
