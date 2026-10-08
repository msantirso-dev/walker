import "server-only";
import { db } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { OrderError, PERS_NAME_RE } from "./pricing";
import { lockOrder, recomputeOrder } from "./recompute";
import { recalcTotals } from "./manage";

/** Motivo del cambio: un cambio voluntario no es lo mismo que un error o una falla. */
export type EditReason = "VOLUNTARY" | "DATA_ERROR" | "TEXTIL_ERROR" | "DEFECT";
export const EDIT_REASON_LABEL: Record<EditReason, string> = {
  VOLUNTARY: "Cambio voluntario del comprador",
  DATA_ERROR: "Error de carga (antes de fabricar)",
  TEXTIL_ERROR: "Error de la textil",
  DEFECT: "Falla de fabricación",
};

export type UnitEdit = {
  sizes: Record<string, string>;
  persName?: string | null;
  persNumber?: string | null;
  playerId?: string | null;
  reason?: EditReason;
  note?: string;
};

/** Una unidad se puede modificar mientras no forme parte de un lote ya aprobado (enviado a fábrica). */
export async function unitLockedByLot(unitId: string) {
  const rows = await db.productionLotUnit.findMany({ where: { unitId, lot: { status: { not: "PENDING_APPROVAL" } } }, select: { delta: true } });
  return rows.reduce((a, r) => a + r.delta, 0) > 0;
}

/**
 * Corrige talles, nombre, número o jugador de una prenda antes de fabricarla.
 * - Valida contra los talles habilitados y las reglas de personalización vigentes.
 * - El precio de la prenda no cambia; los adicionales solo se recalculan si se agregan o se quitan.
 * - Prendas con nombre o número: el cambio de talle voluntario no está permitido (política de cambios);
 *   sí se corrige un error de carga o de la textil, con motivo registrado.
 */
export async function editUnit(actor: Actor, unitId: string, input: UnitEdit) {
  const reason: EditReason = input.reason ?? "DATA_ERROR";
  const unit = await db.orderUnit.findUnique({ where: { id: unitId }, include: { components: true, options: true, order: true } });
  if (!unit) throw new OrderError("Prenda inexistente.");
  if (unit.order.status === "CANCELLED" || unit.status !== "ACTIVE") throw new OrderError("La prenda está cancelada.");
  if (unit.deliveryId) throw new OrderError("La prenda ya fue entregada.");
  if (await unitLockedByLot(unitId)) throw new OrderError("La prenda ya está en un lote enviado a fábrica. El cambio debe hacerse cancelándola y cargando un pedido nuevo.");
  if (reason !== "VOLUNTARY" && (input.note?.trim().length ?? 0) < 5 && reason !== "DATA_ERROR") throw new OrderError("Describí el error o la falla.");

  const product = await db.product.findUnique({
    where: { id: unit.productId },
    include: {
      components: { orderBy: { sort: "asc" }, include: { garment: { include: { sizes: { where: { enabled: true } } } } } },
      optionGroups: { include: { values: true } },
    },
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
  const sizeChanged = unit.components.some((c) => newComponents.find((n) => n.label === c.label)?.sizeLabel !== c.sizeLabel);
  if (sizeChanged && unit.noSizeChange && reason === "VOLUNTARY")
    throw new OrderError("Esta prenda tiene nombre o número: no admite cambio de talle voluntario. Si es un error de carga, de la textil o una falla, indicá el motivo.");

  // undefined = conservar; null o vacío = quitar
  const name = input.persName === undefined ? unit.persName : input.persName?.trim().toUpperCase() || null;
  const number = input.persNumber === undefined ? unit.persNumber : input.persNumber?.trim() || null;
  const nameGroup = product.optionGroups.find((g) => g.role === "NAME" && g.type === "TEXT");
  const numberGroup = product.optionGroups.find((g) => g.role === "NUMBER" && g.type === "NUMBER");
  if (name) {
    if (!nameGroup && !unit.persName) throw new OrderError("Este producto no admite nombre estampado.");
    const max = nameGroup?.maxLength ?? product.persNameMaxLen;
    if (name.length > max || !PERS_NAME_RE.test(name)) throw new OrderError(`El nombre admite hasta ${max} letras, espacios, punto, guion y apóstrofo.`);
  }
  if (number) {
    if (!numberGroup && !unit.persNumber) throw new OrderError("Este producto no admite número.");
    const min = numberGroup?.numberMin ?? product.persNumberMin, max = numberGroup?.numberMax ?? product.persNumberMax;
    if (!/^\d{1,3}$/.test(number) || +number < min || +number > max) throw new OrderError(`El número debe estar entre ${min} y ${max}.`);
  }
  const normNumber = number ? String(+number) : null;

  // Adicionales: se conservan los precios guardados de lo que ya tenía; lo nuevo toma el precio vigente
  type Opt = { groupId: string | null; groupName: string; role: "NAME" | "NUMBER" | "LEGEND" | "OTHER"; value: string; priceTextil: number; priceClub: number; sort: number };
  let options: Opt[] | null = null;
  let persPrice = unit.persPrice, optionsTextil = unit.optionsTextil, optionsClub = unit.optionsClub;
  if (unit.options.length || (!unit.persName && !unit.persNumber)) {
    const keep: Opt[] = unit.options.filter((o) => o.role !== "NAME" && o.role !== "NUMBER").map((o) => ({ ...o }));
    const prevName = unit.options.find((o) => o.role === "NAME");
    const prevNumber = unit.options.find((o) => o.role === "NUMBER");
    if (name) keep.push(prevName ? { ...prevName, value: name } : { groupId: nameGroup!.id, groupName: nameGroup!.name, role: "NAME", value: name, priceTextil: nameGroup!.priceTextil, priceClub: nameGroup!.priceClub, sort: nameGroup!.sort });
    if (normNumber) keep.push(prevNumber ? { ...prevNumber, value: normNumber } : { groupId: numberGroup!.id, groupName: numberGroup!.name, role: "NUMBER", value: normNumber, priceTextil: numberGroup!.priceTextil, priceClub: numberGroup!.priceClub, sort: numberGroup!.sort });
    // La elección que habilita nombre/número (ej. "Nombre y número" / "Solo número") acompaña el cambio
    const parentId = nameGroup?.dependsOnGroupId ?? numberGroup?.dependsOnGroupId ?? null;
    const parent = parentId ? product.optionGroups.find((g) => g.id === parentId) : null;
    if (parent) {
      const idx = keep.findIndex((o) => o.groupId === parent.id);
      const fits = (vid: string) =>
        (name ? nameGroup?.dependsOnValueIds.includes(vid) : !nameGroup?.dependsOnValueIds.includes(vid)) &&
        (normNumber ? numberGroup?.dependsOnValueIds.includes(vid) : !numberGroup?.dependsOnValueIds.includes(vid));
      const v = name || normNumber ? parent.values.find((x) => x.active && fits(x.id)) : null;
      if (idx >= 0) keep.splice(idx, 1);
      if (v) keep.push({ groupId: parent.id, groupName: parent.name, role: "OTHER", value: v.label, priceTextil: v.priceTextil, priceClub: v.priceClub, sort: parent.sort });
    }
    options = keep.sort((a, b) => a.sort - b.sort);
    optionsTextil = options.reduce((a, o) => a + o.priceTextil, 0);
    optionsClub = options.reduce((a, o) => a + o.priceClub, 0);
    persPrice = optionsTextil + optionsClub;
  } else if (Boolean(unit.persName) !== Boolean(name) || Boolean(unit.persNumber) !== Boolean(normNumber)) {
    // Prenda vendida antes del configurador: se recalcula solo si cambia la presencia de nombre o número
    persPrice = (name ? nameGroup?.priceTextil ?? product.persNamePrice : 0) + (normNumber ? numberGroup?.priceTextil ?? product.persNumberPrice : 0);
    optionsTextil = persPrice;
    optionsClub = 0;
  }
  const blocking = new Set(product.optionGroups.filter((g) => g.blocksSizeChange).map((g) => g.id));
  const noSizeChange = options
    ? options.some((o) => (o.groupId ? blocking.has(o.groupId) : false) || o.role === "NAME" || o.role === "NUMBER")
    : Boolean(name || normNumber);

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
    if (options) {
      await tx.orderUnitOption.deleteMany({ where: { unitId } });
      if (options.length) await tx.orderUnitOption.createMany({ data: options.map(({ groupId, groupName, role, value, priceTextil, priceClub, sort }) => ({ unitId, groupId, groupName, role, value, priceTextil, priceClub, sort })) });
    }
    await tx.orderUnit.update({ where: { id: unitId }, data: { persName: name, persNumber: normNumber, persPrice, optionsTextil, optionsClub, noSizeChange, playerId } });
    if (persPrice !== unit.persPrice) await recalcTotals(tx, unit.orderId);
    await audit(actor, {
      entity: "Order", entityId: unit.orderId, clubId: unit.order.clubId, action: "order.unit_edited",
      data: { unit: unit.ref, reason, reasonLabel: EDIT_REASON_LABEL[reason], note: input.note?.trim() || null, before, after },
    }, tx);
    await recomputeOrder(tx, unit.orderId, actor);
  }, { maxWait: 10_000, timeout: 15_000 });
  return { persPriceChanged: persPrice !== unit.persPrice };
}
