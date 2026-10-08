import "server-only";
import { db } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { OrderError } from "@/modules/orders/pricing";
import type { OptionGroupType, OptionRole } from "@/generated/prisma/client";

/**
 * Configurador de opciones por producto (personalización, leyenda de disciplina, adicionales).
 * Los pedidos guardan su propia copia (nombre del grupo, valor y precios): editar acá no cambia pedidos hechos.
 * El reparto textil/club de cada adicional es configurable y queda marcado "a definir" hasta confirmarlo.
 */

export const OPTION_TYPE_LABEL: Record<OptionGroupType, string> = { CHOICE: "Elección", TEXT: "Texto libre", NUMBER: "Número" };
export const OPTION_ROLE_LABEL: Record<OptionRole, string> = { NAME: "Nombre estampado", NUMBER: "Número", LEGEND: "Leyenda de disciplina", OTHER: "Otro adicional" };

export type GroupInput = {
  name: string; type: OptionGroupType; role: OptionRole; required: boolean; sort: number; help?: string | null;
  dependsOnValueIds: string[]; maxLength?: number | null; numberMin?: number | null; numberMax?: number | null;
  priceTextil: number; priceClub: number; splitConfirmed: boolean; blocksSizeChange: boolean;
  values: { label: string; priceTextil: number; priceClub: number }[];
};

export async function saveOptionGroup(actor: Actor, clubId: string, productId: string, groupId: string | null, i: GroupInput) {
  const product = await db.product.findFirst({ where: { id: productId, clubId }, include: { optionGroups: { include: { values: true } } } });
  if (!product) throw new OrderError("Producto inexistente.");
  if (i.name.trim().length < 2) throw new OrderError("Poné un nombre al grupo (ej. Personalización).");
  if (i.role === "NAME" && i.type !== "TEXT") throw new OrderError("El nombre estampado es de tipo texto.");
  if (i.role === "NUMBER" && i.type !== "NUMBER") throw new OrderError("El número es de tipo número.");
  if (i.role === "LEGEND" && i.type !== "CHOICE") throw new OrderError("La leyenda es una elección entre valores definidos.");
  if (i.type === "CHOICE" && !i.values.length) throw new OrderError("Cargá al menos un valor.");
  if (i.type === "NUMBER" && (i.numberMin ?? 0) > (i.numberMax ?? 99)) throw new OrderError("El mínimo no puede superar al máximo.");
  for (const r of ["NAME", "NUMBER", "LEGEND"] as const)
    if (i.role === r && product.optionGroups.some((g) => g.role === r && g.id !== groupId)) throw new OrderError(`El producto ya tiene un grupo de ${OPTION_ROLE_LABEL[r].toLowerCase()}.`);
  if ([i.priceTextil, i.priceClub, ...i.values.flatMap((v) => [v.priceTextil, v.priceClub])].some((p) => !Number.isInteger(p) || p < 0)) throw new OrderError("Precio inválido.");

  // Dependencia: todos los valores elegidos deben ser de un mismo grupo de elección (distinto de este)
  let dependsOnGroupId: string | null = null;
  if (i.dependsOnValueIds.length) {
    const parents = new Set(
      product.optionGroups.filter((g) => g.id !== groupId && g.type === "CHOICE").flatMap((g) => g.values.filter((v) => i.dependsOnValueIds.includes(v.id)).map(() => g.id)),
    );
    if (parents.size !== 1) throw new OrderError("La condición debe usar valores de un solo grupo de elección.");
    dependsOnGroupId = [...parents][0];
  }

  const data = {
    name: i.name.trim(), type: i.type, role: i.role, required: i.required, sort: i.sort, help: i.help?.trim() || null,
    dependsOnGroupId, dependsOnValueIds: dependsOnGroupId ? i.dependsOnValueIds : [],
    maxLength: i.type === "TEXT" ? (i.maxLength ?? 12) : null,
    numberMin: i.type === "NUMBER" ? (i.numberMin ?? 0) : null, numberMax: i.type === "NUMBER" ? (i.numberMax ?? 99) : null,
    priceTextil: i.type === "CHOICE" ? 0 : i.priceTextil, priceClub: i.type === "CHOICE" ? 0 : i.priceClub,
    splitConfirmed: i.splitConfirmed, blocksSizeChange: i.blocksSizeChange,
  };
  const g = await db.$transaction(async (tx) => {
    const g = groupId
      ? await tx.productOptionGroup.update({ where: { id: groupId, productId }, data })
      : await tx.productOptionGroup.create({ data: { ...data, productId } });
    if (i.type === "CHOICE") {
      const existing = await tx.productOptionValue.findMany({ where: { groupId: g.id } });
      const seen = new Set<string>();
      for (const [n, v] of i.values.entries()) {
        const label = v.label.trim();
        if (!label || seen.has(label.toLowerCase())) continue;
        seen.add(label.toLowerCase());
        const ex = existing.find((x) => x.label.toLowerCase() === label.toLowerCase());
        // Se conserva el id del valor (las condiciones de otros grupos lo referencian)
        if (ex) await tx.productOptionValue.update({ where: { id: ex.id }, data: { label, sort: n, priceTextil: v.priceTextil, priceClub: v.priceClub, active: true } });
        else await tx.productOptionValue.create({ data: { groupId: g.id, label, sort: n, priceTextil: v.priceTextil, priceClub: v.priceClub } });
      }
      // Los valores quitados se desactivan, no se borran
      for (const ex of existing) if (!seen.has(ex.label.toLowerCase())) await tx.productOptionValue.update({ where: { id: ex.id }, data: { active: false } });
    }
    return g;
  });
  await audit(actor, { entity: "Product", entityId: productId, clubId, action: "product.options", data: { group: g.id, name: g.name, role: g.role, splitConfirmed: g.splitConfirmed } });
  return g;
}

export async function deleteOptionGroup(actor: Actor, clubId: string, productId: string, groupId: string) {
  const g = await db.productOptionGroup.findFirst({ where: { id: groupId, productId, product: { clubId } } });
  if (!g) throw new OrderError("Grupo inexistente.");
  await db.productOptionGroup.updateMany({ where: { dependsOnGroupId: groupId }, data: { dependsOnGroupId: null, dependsOnValueIds: [] } });
  await db.productOptionGroup.delete({ where: { id: groupId } });
  await audit(actor, { entity: "Product", entityId: productId, clubId, action: "product.options_removed", data: { group: groupId, name: g.name } });
}
