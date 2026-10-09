import "server-only";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/shared/db";
import { isHex, readableOn } from "@/shared/colors";
import { UserError } from "@/shared/errors";
import { audit, diffFields, type Actor } from "@/modules/audit";
import type { SessionUser } from "@/modules/auth";
import type { BrandSettings, DebtBlockScope } from "@/generated/prisma/client";

/**
 * Marca de la empresa (provisoriamente "BACK"): nombre, logo, colores y contacto se editan desde el panel.
 * También guarda la aprobación comercial de la fórmula del anticipo: sin ella no se habilitan cobros reales.
 */
export type Brand = BrandSettings & { ink: string; accentInk: string; formulaApproved: boolean };

const DEFAULTS = { name: "BACK", colorPrimary: "#1D2B4F", colorAccent: "#E9B949" };

export const getBrand = cache(async (): Promise<Brand> => {
  const row = (await db.brandSettings.findUnique({ where: { id: "brand" } })) ?? (await db.brandSettings.create({ data: { id: "brand" } }));
  const primary = isHex(row.colorPrimary) ? row.colorPrimary : DEFAULTS.colorPrimary;
  const accent = isHex(row.colorAccent) ? row.colorAccent : DEFAULTS.colorAccent;
  return { ...row, name: row.name || DEFAULTS.name, colorPrimary: primary, colorAccent: accent, ink: readableOn(primary), accentInk: readableOn(accent), formulaApproved: Boolean(row.formulaApprovedAt) };
});

/** Variables CSS de la marca para el layout raíz (las tiendas las reemplazan con los colores del club). */
export function brandStyle(b: Brand): Record<string, string> {
  return { "--brand": b.colorPrimary, "--brand-ink": b.ink, "--accent": b.colorAccent, "--accent-ink": b.accentInk };
}

export const DEBT_BLOCK_LABEL: Record<DebtBlockScope, string> = {
  ADDITIONAL_ONLY: "Solo las unidades adicionales del club",
  WHOLE_SHIPMENT: "Todo el despacho al club",
};

const hex = z.string().trim().refine(isHex, "Usá un color en formato #RRGGBB.");
const optText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();
export const brandInput = z.object({
  name: z.string().trim().min(2, "Nombre demasiado corto.").max(40),
  tagline: optText(120),
  colorPrimary: hex,
  colorAccent: hex,
  contactEmail: z.string().trim().max(120).transform((v) => v || null).nullable().optional().refine((v) => !v || z.email().safeParse(v).success, "Correo inválido."),
  whatsapp: optText(30),
  instagram: optText(60),
  aboutText: optText(2000),
  debtBlockDefault: z.enum(["ADDITIONAL_ONLY", "WHOLE_SHIPMENT"]),
});

function assertCompany(user: SessionUser) {
  if (user.role !== "TEXTIL_ADMIN") throw new UserError("Solo la empresa puede modificar la marca.");
}

export async function updateBrand(user: SessionUser, actor: Actor, raw: unknown, logoUrl?: string | null) {
  assertCompany(user);
  const input = brandInput.parse(raw);
  const prev = await getBrandRow();
  const next = { ...input, ...(logoUrl !== undefined ? { logoUrl } : {}) };
  const d = diffFields(prev as unknown as Record<string, unknown>, next);
  if (!d.changed) return;
  await db.brandSettings.update({ where: { id: "brand" }, data: { ...next, updatedById: user.id } });
  await audit(actor, { entity: "brand", entityId: "brand", action: "brand.updated", before: d.before, after: d.after });
}

/** Registra (o retira) la aprobación comercial de la fórmula del anticipo. */
export async function setFormulaApproval(user: SessionUser, actor: Actor, approve: boolean, note: string | null) {
  assertCompany(user);
  const prev = await getBrandRow();
  if (approve && !note) throw new UserError("Describí qué se aprobó (bases, porcentajes y a quién corresponde la deducción).");
  const next = approve ? { formulaApprovedAt: new Date(), formulaApprovedById: user.id, formulaNote: note } : { formulaApprovedAt: null, formulaApprovedById: null, formulaNote: note };
  await db.brandSettings.update({ where: { id: "brand" }, data: next });
  await audit(actor, {
    entity: "brand", entityId: "brand", action: approve ? "brand.formula_approved" : "brand.formula_revoked",
    before: { formulaApprovedAt: prev.formulaApprovedAt?.toISOString() ?? null, formulaNote: prev.formulaNote },
    after: { formulaApprovedAt: next.formulaApprovedAt?.toISOString() ?? null, formulaNote: next.formulaNote },
  });
}

async function getBrandRow() {
  return (await db.brandSettings.findUnique({ where: { id: "brand" } })) ?? (await db.brandSettings.create({ data: { id: "brand" } }));
}

/** ¿Se pueden crear cobros reales? Solo con la fórmula aprobada. El simulador y las tiendas demo no dependen de esto. */
export async function realPaymentsAllowed() {
  return Boolean((await getBrandRow()).formulaApprovedAt);
}
