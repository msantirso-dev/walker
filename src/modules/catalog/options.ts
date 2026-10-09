/**
 * Lógica del configurador de opciones. Sin dependencias de servidor: la usan la tienda (para mostrar)
 * y el servidor (para validar y cobrar). El servidor siempre recalcula.
 */

export type OptionRoleT = "NAME" | "NUMBER" | "LEGEND" | "OTHER";
export type OptionGroupT = {
  id: string;
  name: string;
  type: "CHOICE" | "TEXT" | "NUMBER";
  role: OptionRoleT;
  required: boolean;
  sort: number;
  help: string | null;
  dependsOnGroupId: string | null;
  dependsOnValueIds: string[];
  maxLength: number | null;
  numberMin: number | null;
  numberMax: number | null;
  priceTextil: number;
  priceClub: number;
  blocksSizeChange: boolean;
  values: { id: string; label: string; sort: number; priceTextil: number; priceClub: number; active: boolean }[];
};

export type ResolvedOption = {
  groupId: string;
  groupName: string;
  role: OptionRoleT;
  value: string;
  priceTextil: number;
  priceClub: number;
  sort: number;
  blocksSizeChange: boolean;
  freeText: boolean;
};

export const NAME_RE = /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ .'-]*$/;
const TEXT_RE = /^[\p{L}\p{N} .,'#-]+$/u;

/** Política de cambios vigente para prendas personalizadas. Cambiar la versión al cambiar el texto. */
export const CHANGE_POLICY_VERSION = "cambios-personalizadas-v2";
export const CHANGE_POLICY_TEXT =
  "Las prendas con nombre o número estampado no admiten cambio de talle. Las prendas con defectos o errores de fabricación se reclaman aparte y no están alcanzadas por esta restricción.";
export const CHANGE_POLICY_UNPERSONALIZED =
  "Para prendas sin nombre ni número, el cambio de talle depende de la política del club y de las unidades disponibles; no está garantizado.";

export class OptionError extends Error {}

/** ¿El grupo se muestra con estas selecciones? */
export function isVisible(g: OptionGroupT, selections: Record<string, string | undefined>) {
  if (!g.dependsOnGroupId) return true;
  const chosen = selections[g.dependsOnGroupId];
  return Boolean(chosen && g.dependsOnValueIds.includes(chosen));
}

export function sortGroups(groups: OptionGroupT[]) {
  return [...groups].sort((a, b) => a.sort - b.sort);
}

/**
 * Valida y resuelve las opciones elegidas. Los grupos ocultos se ignoran.
 * Lanza OptionError con un mensaje apto para el comprador.
 */
export function resolveOptions(groups: OptionGroupT[], raw: Record<string, string | undefined>, productName: string): ResolvedOption[] {
  const known = new Set(groups.map((g) => g.id));
  for (const k of Object.keys(raw)) if (raw[k] && !known.has(k)) throw new OptionError(`Hay una opción que no corresponde a ${productName}. Actualizá la página.`);
  const out: ResolvedOption[] = [];
  for (const g of sortGroups(groups)) {
    if (!isVisible(g, raw)) {
      // Un valor cargado en un grupo que no corresponde no se descarta en silencio
      if (raw[g.id]?.trim()) throw new OptionError(`"${g.name}" no corresponde con las opciones elegidas en ${productName}.`);
      continue;
    }
    const v = raw[g.id]?.trim();
    if (!v) {
      if (g.required) throw new OptionError(`Completá "${g.name}" en ${productName}.`);
      continue;
    }
    if (g.type === "CHOICE") {
      const val = g.values.find((x) => x.id === v && x.active);
      if (!val) throw new OptionError(`La opción elegida en "${g.name}" ya no está disponible.`);
      out.push({ groupId: g.id, groupName: g.name, role: g.role, value: val.label, priceTextil: val.priceTextil, priceClub: val.priceClub, sort: g.sort, blocksSizeChange: g.blocksSizeChange, freeText: false });
    } else if (g.type === "TEXT") {
      const text = g.role === "NAME" ? v.toUpperCase() : v;
      const max = g.maxLength ?? 20;
      if (text.length > max) throw new OptionError(`"${g.name}" admite hasta ${max} caracteres.`);
      if (g.role === "NAME" ? !NAME_RE.test(text) : !TEXT_RE.test(text))
        throw new OptionError(g.role === "NAME" ? `"${g.name}" solo admite letras, espacios, punto, guion y apóstrofo.` : `"${g.name}" tiene caracteres no admitidos.`);
      out.push({ groupId: g.id, groupName: g.name, role: g.role, value: text, priceTextil: g.priceTextil, priceClub: g.priceClub, sort: g.sort, blocksSizeChange: g.blocksSizeChange, freeText: true });
    } else {
      if (!/^\d{1,3}$/.test(v)) throw new OptionError(`"${g.name}" debe ser un número.`);
      const n = Number(v);
      const min = g.numberMin ?? 0, max = g.numberMax ?? 99;
      if (n < min || n > max) throw new OptionError(`"${g.name}" debe estar entre ${min} y ${max}.`);
      out.push({ groupId: g.id, groupName: g.name, role: g.role, value: String(n), priceTextil: g.priceTextil, priceClub: g.priceClub, sort: g.sort, blocksSizeChange: g.blocksSizeChange, freeText: true });
    }
  }
  return out;
}

export function optionsSummary(opts: ResolvedOption[]) {
  return {
    textil: opts.reduce((a, o) => a + o.priceTextil, 0),
    club: opts.reduce((a, o) => a + o.priceClub, 0),
    name: opts.find((o) => o.role === "NAME")?.value ?? null,
    number: opts.find((o) => o.role === "NUMBER")?.value ?? null,
    legend: opts.find((o) => o.role === "LEGEND")?.value ?? null,
    noSizeChange: opts.some((o) => o.blocksSizeChange),
    freeText: opts.some((o) => o.freeText),
  };
}
