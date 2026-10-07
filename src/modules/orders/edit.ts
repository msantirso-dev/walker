import "server-only";
import { db } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { OrderError, PERS_NAME_RE } from "./pricing";
import { lockOrder, recomputeOrder } from "./recompute";
import { recalcTotals } from "./manage";

export type UnitEdit = {
  sizes: Record<string, string>;
  persName?: string | null;
  persNumber?: string | null;
  playerId?: string | null;
};

/** Una unidad se puede modificar mientras no forme parte de un lote ya aprobado (enviado a fábrica). */
export async function unitLockedByLot(unitId: string) {
  const rows = await db.productionLotUnit.findMany({ where: { unitId, lot: { status: { not: "PENDING_APPROVAL" } } }, select: { delta: true } });
  return rows.reduce((a, r) => a + r.delta, 0) > 0;
}

/**
 * Corrige talles, personalización o jugador de una prenda a pedido del comprador.
 * - Valida contra los talles habilitados y las reglas de personalización vigentes.
 * - El precio de la prenda no cambia; la personalización solo se recalcula si se agrega o se quita.
 * - Queda registrado el antes y el después.
 */
export async function editUnit(actor: Actor, unitId: string, input: UnitEdit) {
  const unit = await db.orderUnit.findUnique({ where: { id: unitId }, include: { components: true, order: true } });
  if (!unit) throw new OrderError("Prenda inexistente.");
  if (unit.order.status === "CANCELLED" || unit.status !== "ACTIVE") throw new OrderError("La prenda está cancelada.");
  if (unit.deliveryId) throw new OrderError("La prenda ya fue entregada.");
  if (await unitLockedByLot(unitId)) throw new OrderError("La prenda ya está en un lote enviado a fábrica. El cambio debe hacerse cancelándola y cargando un pedido nuevo.");

  const product = await db.product.findUnique({
    where: { id: unit.productId },
    include: { components: { orderBy: { sort: "asc" }, include: { garment: { include: { sizes: { where: { enabled: true } } } } } } },
  });
  if (!product) throw new OrderError("El producto ya no existe en el catálogo.");
  const snapLabels = unit.components.map((c) => c.label).sort().join("|");
  const curLabels = product.components.map((c) => c.label).sort().join("|");
  if (snapLabels !== curLabels) throw new OrderError("Los componentes del producto cambiaron desde la compra. Cancelá la prenda y cargala de nuevo.");

  const newComponents = product.components.map((comp) => {
    const size = input.sizes[comp.label];
    if (!size) throw new OrderError(`Elegí el talle de ${comp.label.toLowerCase()}.`);
    const gs = comp.garment.sizes.find((s) => s.label === size);
    if (!gs) throw new OrderError(`El talle ${size} no está habilitado para ${comp.label.toLowerCase()}.`);
    return { garmentId: comp.garmentId, garmentCode: comp.garment.code, garmentName: comp.garment.name, variant: comp.garment.variant, label: comp.label, sizeLabel: gs.label, printTarget: comp.printTarget };
  });

  // undefined = conservar; null o vacío = quitar
  const name = input.persName === undefined ? unit.persName : input.persName?.trim().toUpperCase() || null;
  const number = input.persNumber === undefined ? unit.persNumber : input.persNumber?.trim() || null;
  if (name) {
    if (!product.persNameEnabled) throw new OrderError("Este producto no admite nombre estampado.");
    if (name.length > product.persNameMaxLen || !PERS_NAME_RE.test(name)) throw new OrderError(`El nombre admite hasta ${product.persNameMaxLen} letras, espacios, punto, guion y apóstrofo.`);
  }
  if (number) {
    if (!product.persNumberEnabled) throw new OrderError("Este producto no admite número.");
    if (!/^\d{1,3}$/.test(number) || +number < product.persNumberMin || +number > product.persNumberMax) throw new OrderError(`El número debe estar entre ${product.persNumberMin} y ${product.persNumberMax}.`);
  }
  const normNumber = number ? String(+number) : null;

  let persPrice = unit.persPrice;
  const hadName = Boolean(unit.persName), hadNumber = Boolean(unit.persNumber);
  if (hadName !== Boolean(name) || hadNumber !== Boolean(normNumber)) {
    persPrice = (name ? product.persNamePrice : 0) + (normNumber ? product.persNumberPrice : 0);
  }

  let playerId = unit.playerId;
  if (input.playerId !== undefined) {
    if (input.playerId) {
      const p = await db.player.findFirst({ where: { id: input.playerId, orderId: unit.orderId } });
      if (!p) throw new OrderError("El jugador no pertenece a este pedido.");
    }
    playerId = input.playerId || null;
  }

  const before = { sizes: unit.components.map((c) => `${c.label} ${c.sizeLabel}`), persName: unit.persName, persNumber: unit.persNumber, persPrice: unit.persPrice, playerId: unit.playerId };
  const after = { sizes: newComponents.map((c) => `${c.label} ${c.sizeLabel}`), persName: name, persNumber: normNumber, persPrice, playerId };
  if (JSON.stringify(before) === JSON.stringify(after)) throw new OrderError("No hay cambios para guardar.");

  await db.$transaction(async (tx) => {
    await lockOrder(tx, unit.orderId);
    await tx.orderUnitComponent.deleteMany({ where: { unitId } });
    await tx.orderUnitComponent.createMany({ data: newComponents.map((c) => ({ ...c, unitId })) });
    await tx.orderUnit.update({ where: { id: unitId }, data: { persName: name, persNumber: normNumber, persPrice, playerId } });
    if (persPrice !== unit.persPrice) await recalcTotals(tx, unit.orderId);
    await audit(actor, { entity: "Order", entityId: unit.orderId, clubId: unit.order.clubId, action: "order.unit_edited", data: { unit: unit.ref, before, after } }, tx);
    await recomputeOrder(tx, unit.orderId, actor);
  }, { maxWait: 10_000, timeout: 15_000 });
  return { persPriceChanged: persPrice !== unit.persPrice };
}
