import "server-only";
import { db } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { OrderError } from "@/modules/orders/pricing";
import { advanceLot } from "@/modules/production";
import type { CostBearer, ShipmentStatus } from "@/generated/prisma/client";

/**
 * Entrega consolidada textil → club. No hay envío a domicilio del comprador:
 * la producción completa se despacha al club (transporte a elección, ej. Via Cargo, sin integración),
 * y el club entrega a cada socio registrando el retiro.
 * Quién paga el envío está pendiente de definición: se registra, nunca se asume gratis.
 */

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = { PREPARING: "En preparación", DISPATCHED: "Despachado", RECEIVED: "Recibido por el club" };
export const COST_BEARER_LABEL: Record<CostBearer, string> = { PENDING: "A definir", TEXTIL: "Textil", CLUB: "Club" };

export type ShipmentInput = {
  address: string; receiverName: string; receiverPhone?: string | null; carrier?: string | null; trackingRef?: string | null;
  cost?: number | null; costBearer: CostBearer; notes?: string | null; lotIds: string[];
};

export async function createShipment(actor: Actor & { id: string }, campaignId: string, i: ShipmentInput) {
  if (i.address.trim().length < 5) throw new OrderError("Indicá la dirección de entrega del club.");
  if (i.receiverName.trim().length < 3) throw new OrderError("Indicá el responsable de recepción en el club.");
  if (!i.lotIds.length) throw new OrderError("Elegí los lotes que viajan en este envío.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const lots = await tx.productionLot.findMany({ where: { id: { in: i.lotIds }, campaignId } });
    if (lots.length !== i.lotIds.length) throw new OrderError("Algún lote no es de esta campaña.");
    for (const l of lots) {
      if (l.status !== "READY_TO_SHIP") throw new OrderError(`El lote ${l.number} no está listo para despacho.`);
      if (l.shipmentId) throw new OrderError(`El lote ${l.number} ya está en otro envío.`);
    }
    const last = await tx.clubShipment.findFirst({ where: { campaignId }, orderBy: { number: "desc" } });
    const s = await tx.clubShipment.create({
      data: {
        number: (last?.number ?? 0) + 1, clubId: c.clubId, campaignId, address: i.address.trim(), receiverName: i.receiverName.trim(),
        receiverPhone: i.receiverPhone?.trim() || null, carrier: i.carrier?.trim() || null, trackingRef: i.trackingRef?.trim() || null,
        cost: i.cost ?? null, costBearer: i.costBearer, notes: i.notes?.trim() || null, createdById: actor.id,
      },
    });
    await tx.productionLot.updateMany({ where: { id: { in: i.lotIds } }, data: { shipmentId: s.id } });
    await audit(actor, { entity: "ClubShipment", entityId: s.id, clubId: c.clubId, action: "shipment.created", data: { number: s.number, lots: lots.map((l) => l.number), carrier: s.carrier, costBearer: s.costBearer } }, tx);
    return s;
  });
}

export async function dispatchShipment(actor: Actor, shipmentId: string, input: { dispatchedAt: Date; carrier?: string | null; trackingRef?: string | null }) {
  const s = await db.clubShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lots: true } });
  if (s.status !== "PREPARING") throw new OrderError("El envío ya fue despachado.");
  if (!s.lots.length) throw new OrderError("El envío no tiene lotes.");
  await db.clubShipment.update({
    where: { id: shipmentId },
    data: { status: "DISPATCHED", dispatchedAt: input.dispatchedAt, carrier: input.carrier?.trim() || s.carrier, trackingRef: input.trackingRef?.trim() || s.trackingRef },
  });
  await audit(actor, { entity: "ClubShipment", entityId: shipmentId, clubId: s.clubId, action: "shipment.dispatched", data: { at: input.dispatchedAt.toISOString(), trackingRef: input.trackingRef ?? s.trackingRef } });
}

/** El club confirma la recepción: los lotes pasan a "recibido por el club" y los pedidos quedan listos para retirar. */
export async function receiveShipment(actor: Actor, clubIdOfUser: string | null, shipmentId: string, input: { receivedAt: Date; receivedBy: string; notes?: string | null }) {
  const s = await db.clubShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lots: true } });
  if (clubIdOfUser && clubIdOfUser !== s.clubId) throw new OrderError("El envío no es de tu club.");
  if (s.status !== "DISPATCHED") throw new OrderError("El envío todavía no fue despachado.");
  if (input.receivedBy.trim().length < 3) throw new OrderError("Indicá quién recibió el envío.");
  await db.clubShipment.update({
    where: { id: shipmentId },
    data: { status: "RECEIVED", receivedAt: input.receivedAt, receivedBy: input.receivedBy.trim(), notes: [s.notes, input.notes?.trim()].filter(Boolean).join("\n") || null },
  });
  for (const l of s.lots) if (l.status === "READY_TO_SHIP") await advanceLot(actor, l.id, "RECEIVED_BY_CLUB");
  await audit(actor, { entity: "ClubShipment", entityId: shipmentId, clubId: s.clubId, action: "shipment.received", data: { by: input.receivedBy.trim(), lots: s.lots.length } });
}

/** Remito consolidado: cabecera del envío + prendas por producto y talle + bultos por pedido. */
export async function shipmentRemito(shipmentId: string) {
  const s = await db.clubShipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { club: true, campaign: true, lots: { include: { units: { include: { unit: { include: { order: { select: { code: true, buyerName: true } }, components: true, player: { select: { name: true } } } } } } } } },
  });
  const net = new Map<string, { unit: (typeof s.lots)[number]["units"][number]["unit"]; n: number }>();
  for (const l of s.lots) for (const lu of l.units) {
    const cur = net.get(lu.unitId) ?? { unit: lu.unit, n: 0 };
    cur.n += lu.delta;
    net.set(lu.unitId, cur);
  }
  const units = [...net.values()].filter((x) => x.n > 0).map((x) => x.unit);
  const lines = new Map<string, { product: string; component: string; size: string; qty: number }>();
  const byOrder = new Map<string, { code: string; buyer: string; units: number }>();
  for (const u of units) {
    for (const c of u.components) {
      const k = `${u.productCode}|${c.label}|${c.sizeLabel}`;
      const r = lines.get(k) ?? { product: `${u.productCode} · ${u.productName}`, component: c.label, size: c.sizeLabel, qty: 0 };
      r.qty++;
      lines.set(k, r);
    }
    const o = byOrder.get(u.orderId) ?? { code: u.order.code, buyer: u.order.buyerName, units: 0 };
    o.units++;
    byOrder.set(u.orderId, o);
  }
  return {
    shipment: s,
    lots: s.lots.map((l) => l.number),
    lines: [...lines.values()].sort((a, b) => a.product.localeCompare(b.product) || a.component.localeCompare(b.component) || a.size.localeCompare(b.size, undefined, { numeric: true })),
    orders: [...byOrder.values()].sort((a, b) => a.buyer.localeCompare(b.buyer)),
    totalUnits: units.length,
  };
}

/**
 * Lista de distribución del club: por comprador y jugador, qué prendas le corresponden,
 * saldo pendiente con el club y estado de retiro.
 */
export async function distributionList(campaignId: string) {
  const orders = await db.order.findMany({
    where: { campaignId, status: "CONFIRMED" },
    orderBy: { buyerName: "asc" },
    include: {
      units: { where: { status: "ACTIVE" }, orderBy: { sort: "asc" }, include: { player: true, components: true, delivery: true } },
      deliveries: { orderBy: { deliveredAt: "asc" } },
    },
  });
  const ready = await db.productionLotUnit.groupBy({
    by: ["unitId"], where: { unit: { order: { campaignId } }, lot: { status: "RECEIVED_BY_CLUB" } }, _sum: { delta: true },
  });
  const inClub = new Set(ready.filter((r) => (r._sum.delta ?? 0) > 0).map((r) => r.unitId));
  return orders.map((o) => {
    const clubDue = o.pricingModel === "TEXTIL_ADVANCE" ? Math.max(0, o.clubBalanceRequired - o.clubPaid) : Math.max(0, o.total - o.paidAmount);
    return {
      id: o.id, code: o.code, buyer: o.buyerName, phone: o.buyerPhone, memberNumber: o.memberNumber, clubDue, deliveryStatus: o.deliveryStatus,
      units: o.units.map((u) => ({
        ref: u.ref, product: u.productName, player: u.player?.name ?? null, category: u.player?.category ?? null,
        sizes: u.components.map((c) => `${c.label} ${c.sizeLabel}`).join(" · "),
        pers: [u.persName, u.persNumber && `N° ${u.persNumber}`, u.legend].filter(Boolean).join(" · "),
        inClub: inClub.has(u.id), delivered: Boolean(u.deliveryId), deliveredTo: u.delivery?.receivedByName ?? null, deliveredAt: u.delivery?.deliveredAt ?? null,
      })),
      deliveries: o.deliveries.map((d) => ({ at: d.deliveredAt, to: d.receivedByName, exception: d.balanceException })),
    };
  });
}
export type DistributionRow = Awaited<ReturnType<typeof distributionList>>[number];
