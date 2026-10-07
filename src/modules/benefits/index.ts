import "server-only";
import { db } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { OrderError } from "@/modules/orders/pricing";
import type { BenefitType } from "@/generated/prisma/client";

export const BENEFIT_TYPE_LABEL: Record<BenefitType, string> = {
  FIXED_PER_UNIT: "Importe fijo por prenda",
  PERCENT_OF_GARMENTS: "Porcentaje sobre el precio de las prendas (sin personalización ni envío)",
};

/**
 * Regla de beneficio del club. Rige para pedidos que se confirmen desde ahora:
 * los ya confirmados conservan el importe fijado al confirmarse.
 */
export async function setBenefitRule(actor: Actor, campaignId: string, rule: { type: BenefitType; value: number; notes?: string } | null) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (rule === null) {
    await db.benefitRule.deleteMany({ where: { campaignId } });
  } else {
    if (!Number.isInteger(rule.value) || rule.value < 0) throw new OrderError("Valor de beneficio inválido.");
    if (rule.type === "PERCENT_OF_GARMENTS" && rule.value > 5000) throw new OrderError("El porcentaje no puede superar 50 %.");
    await db.benefitRule.upsert({ where: { campaignId }, create: { campaignId, ...rule }, update: rule });
  }
  await audit(actor, { entity: "Campaign", entityId: campaignId, clubId: c.clubId, action: "benefit.rule", data: rule ?? { removed: true } });
}

/** Registra una liquidación realizada. Es un registro comercial: no transfiere dinero. */
export async function addSettlement(actor: Actor & { id: string }, campaignId: string, input: { amount: number; settledAt: Date; reference?: string; notes?: string }) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new OrderError("Importe inválido.");
  const s = await db.benefitSettlement.create({ data: { campaignId, amount: input.amount, settledAt: input.settledAt, reference: input.reference || null, notes: input.notes || null, createdById: actor.id } });
  await audit(actor, { entity: "Campaign", entityId: campaignId, clubId: c.clubId, action: "benefit.settlement", data: { amount: input.amount, reference: input.reference ?? null } });
  return s;
}
