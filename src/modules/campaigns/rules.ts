import "server-only";
import { db } from "@/shared/db";
import { audit, type Actor } from "@/modules/audit";
import { OrderError, priceWithMarkup } from "@/modules/orders/pricing";
import type { SessionUser } from "@/modules/auth";
import type { CampaignAudience, ProductionRuleType } from "@/generated/prisma/client";

/**
 * Reglas comerciales v2 de campaña:
 * - el club solicita la activación; la textil la autoriza (son pasos separados);
 * - precio textil (anticipo) y precio al socio (final ≥ textil), por precio directo o recargo %;
 * - reglas de producción por producto: categoría completa o compra inicial del club.
 * Ninguna regla se aprueba sola.
 */

export const RULE_LABEL: Record<ProductionRuleType, string> = {
  NONE: "Sin regla",
  FULL_CATEGORY: "Categoría completa",
  INITIAL_PURCHASE: "Compra inicial del club",
};
export const AUDIENCE_LABEL: Record<CampaignAudience, string> = { ALL: "Todo el club", SPORTS: "Disciplinas", CATEGORIES: "Categorías" };

/** Compra inicial sugerida para outfits. Estimada, editable por producto y campaña (ver docs/REQUISITOS.md). */
export const OUTFIT_INITIAL_PURCHASE_DEFAULT = 15;

const EDITABLE = ["DRAFT", "ACTIVATION_REQUESTED", "ACTIVATION_APPROVED"] as const;
const isEditable = (s: string) => (EDITABLE as readonly string[]).includes(s);

export async function campaignProductIds(campaignId: string) {
  return (await db.campaignProduct.findMany({ where: { campaignId }, select: { productId: true } })).map((p) => p.productId);
}

/** Estado de catálogo según campañas: en preventa si hay una publicada; si no, preventa cerrada. */
export async function syncCatalogStatus(productIds: string[]) {
  for (const productId of [...new Set(productIds)]) {
    const p = await db.product.findUnique({ where: { id: productId }, select: { catalogStatus: true } });
    if (!p || p.catalogStatus === "ARCHIVED" || p.catalogStatus === "PREPARATION") continue;
    const live = await db.campaignProduct.count({ where: { productId, active: true, campaign: { status: "PUBLISHED" } } });
    const next = live ? "PRESALE" : p.catalogStatus === "PRESALE" ? "PRESALE_CLOSED" : p.catalogStatus;
    if (next !== p.catalogStatus) await db.product.update({ where: { id: productId }, data: { catalogStatus: next } });
  }
}

/** Unidades confirmadas de un producto en la campaña, opcionalmente filtradas por categoría del jugador. */
export async function confirmedUnits(campaignId: string, productId: string, categoryName?: string | null) {
  return db.orderUnit.count({
    where: {
      productId, status: "ACTIVE", order: { campaignId, status: "CONFIRMED" },
      ...(categoryName ? { player: { category: categoryName } } : {}),
    },
  });
}

type RuleCp = {
  ruleType: ProductionRuleType; ruleCategoryId: string | null; expectedQty: number | null; initialPurchaseMin: number | null;
  initialPurchaseWaived: boolean; ruleApprovedAt: Date | null;
  clubPurchase: { committedQty: number; paidQty: number; sizeStatus: string; approvedAt: Date | null } | null;
};

/** Qué le falta a un producto para poder abrir su preventa. */
export function ruleOpenProblems(cp: RuleCp, name: string): string[] {
  const out: string[] = [];
  if (cp.ruleType === "FULL_CATEGORY") {
    if (!cp.ruleCategoryId) out.push(`${name}: elegí la categoría de la campaña de categoría completa.`);
    if (!cp.expectedQty) out.push(`${name}: indicá la cantidad esperada de la categoría.`);
    if (!cp.ruleApprovedAt) out.push(`${name}: falta la aprobación de la textil para la campaña de categoría completa.`);
  }
  if (cp.ruleType === "INITIAL_PURCHASE") {
    const min = cp.initialPurchaseMin ?? 0;
    if (cp.initialPurchaseWaived) {
      if (!cp.ruleApprovedAt) out.push(`${name}: la excepción a la compra inicial necesita aprobación de la textil.`);
    } else {
      const p = cp.clubPurchase;
      if (!min) out.push(`${name}: indicá la compra inicial mínima.`);
      else if (!p) out.push(`${name}: falta vincular la compra inicial del club (mínimo ${min}).`);
      else {
        if (p.committedQty < min) out.push(`${name}: la compra inicial comprometida (${p.committedQty}) no alcanza el mínimo (${min}).`);
        if (p.paidQty < min) out.push(`${name}: la compra inicial pagada (${p.paidQty}) no alcanza el mínimo (${min}).`);
        if (p.sizeStatus !== "DEFINED") out.push(`${name}: falta la distribución de talles de la compra inicial.`);
        if (!p.approvedAt) out.push(`${name}: la compra inicial no está aprobada por la textil.`);
      }
    }
  }
  return out;
}

/** Todo lo que impide autorizar o publicar una campaña con modelo de anticipo textil. */
export async function activationProblems(campaignId: string): Promise<string[]> {
  const c = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      audienceSports: true, audienceCategories: true, paymentAccount: true,
      products: { where: { active: true }, include: { product: { select: { name: true, catalogStatus: true, active: true } }, clubPurchase: true } },
    },
  });
  const out: string[] = [];
  if (!c.products.length) out.push("agregá al menos un producto.");
  if (c.closesAt <= c.opensAt) out.push("la fecha de cierre debe ser posterior a la apertura.");
  if (c.closesAt <= new Date()) out.push("la fecha de cierre ya pasó.");
  if (c.audience === "SPORTS" && !c.audienceSports.length) out.push("elegí al menos una disciplina para el alcance.");
  if (c.audience === "CATEGORIES" && !c.audienceCategories.length) out.push("elegí al menos una categoría para el alcance.");
  if (c.pricingModel === "TEXTIL_ADVANCE") {
    if (c.paymentAccount.owner !== "TEXTIL") out.push("el anticipo se cobra en la cuenta de la textil: elegí una cuenta de la textil.");
    if (!c.allowMercadoPago && !c.allowTransfer) out.push("habilitá Mercado Pago para el anticipo.");
  }
  for (const cp of c.products) {
    const n = cp.product.name;
    if (!cp.product.active || cp.product.catalogStatus === "PREPARATION" || cp.product.catalogStatus === "ARCHIVED")
      out.push(`${n}: el producto está en preparación o archivado.`);
    if (c.pricingModel === "TEXTIL_ADVANCE") {
      if (!cp.textilPrice) out.push(`${n}: falta el precio textil.`);
      else if (cp.price < cp.textilPrice) out.push(`${n}: el precio al socio no puede ser menor que el precio textil.`);
    }
    out.push(...ruleOpenProblems(cp, n));
  }
  return out;
}

function assertClubOrTextil(user: SessionUser, clubId: string) {
  if (user.role === "TEXTIL_ADMIN") return;
  if (user.role === "CLUB_ADMIN" && user.clubId === clubId) return;
  throw new OrderError("No tenés permiso sobre esta campaña.");
}

/** El club pide activar la campaña. No la publica: falta la autorización de la textil. */
export async function requestActivation(user: SessionUser, actor: Actor, campaignId: string, note?: string) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  assertClubOrTextil(user, c.clubId);
  if (c.status !== "DRAFT") throw new OrderError("Solo se solicita la activación de una campaña en borrador.");
  if (c.pricingModel !== "TEXTIL_ADVANCE") throw new OrderError("Esta campaña usa el modelo anterior: se publica directamente.");
  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "ACTIVATION_REQUESTED", activationRequestedAt: new Date(), activationRequestedById: user.id, activationNote: note?.trim() || null },
  });
  await audit(actor, { entity: "Campaign", entityId: campaignId, clubId: c.clubId, action: "campaign.activation_requested", data: { note: note ?? null } });
}

/** La textil autoriza la activación. Verifica precios y reglas de producción; nunca se aprueba sola. */
export async function approveActivation(user: SessionUser, actor: Actor, campaignId: string) {
  if (user.role !== "TEXTIL_ADMIN") throw new OrderError("Solo la textil autoriza la activación.");
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (!["DRAFT", "ACTIVATION_REQUESTED"].includes(c.status)) throw new OrderError("La campaña no está pendiente de autorización.");
  const problems = await activationProblems(campaignId);
  if (problems.length) throw new OrderError(`No se puede autorizar: ${problems.join(" ")}`);
  await db.campaign.update({ where: { id: campaignId }, data: { status: "ACTIVATION_APPROVED", activationApprovedAt: new Date(), activationApprovedById: user.id } });
  await audit(actor, { entity: "Campaign", entityId: campaignId, clubId: c.clubId, action: "campaign.activation_approved" });
}

export async function rejectActivation(user: SessionUser, actor: Actor, campaignId: string, reason: string) {
  if (user.role !== "TEXTIL_ADMIN") throw new OrderError("Solo la textil responde la solicitud.");
  if (reason.trim().length < 5) throw new OrderError("Indicá el motivo para el club.");
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (!["ACTIVATION_REQUESTED", "ACTIVATION_APPROVED"].includes(c.status)) throw new OrderError("La campaña no tiene una solicitud pendiente.");
  await db.campaign.update({ where: { id: campaignId }, data: { status: "DRAFT", activationApprovedAt: null, activationApprovedById: null, activationNote: reason.trim() } });
  await audit(actor, { entity: "Campaign", entityId: campaignId, clubId: c.clubId, action: "campaign.activation_rejected", data: { reason: reason.trim() } });
}

export type PriceInput = { textilPrice?: number | null; price?: number | null; markupPercent?: number | null };

/**
 * Precios de un producto en la campaña. La textil fija el precio textil; el club fija el precio al socio
 * (directo o como % de recargo). Solo antes de publicar: los pedidos guardan su propio precio.
 */
export async function setCampaignProductPrices(user: SessionUser, actor: Actor, campaignProductId: string, input: PriceInput) {
  const cp = await db.campaignProduct.findUniqueOrThrow({ where: { id: campaignProductId }, include: { campaign: true, product: { select: { name: true } } } });
  assertClubOrTextil(user, cp.campaign.clubId);
  if (!isEditable(cp.campaign.status)) throw new OrderError("Los precios no se cambian con la campaña publicada. Las reglas nuevas aplican a campañas nuevas.");
  let textilPrice = cp.textilPrice;
  if (input.textilPrice !== undefined && input.textilPrice !== cp.textilPrice) {
    if (user.role !== "TEXTIL_ADMIN") throw new OrderError("El precio textil lo define la textil.");
    if (input.textilPrice == null || !Number.isInteger(input.textilPrice) || input.textilPrice <= 0) throw new OrderError("Precio textil inválido.");
    textilPrice = input.textilPrice;
  }
  let price = cp.price;
  let markupBp = cp.markupBp;
  if (input.markupPercent != null) {
    if (!textilPrice) throw new OrderError("Primero tiene que estar el precio textil.");
    if (!Number.isFinite(input.markupPercent) || input.markupPercent < 0 || input.markupPercent > 500) throw new OrderError("El recargo debe estar entre 0 % y 500 %.");
    markupBp = Math.round(input.markupPercent * 100);
    price = priceWithMarkup(textilPrice, markupBp);
  } else if (input.price != null) {
    if (!Number.isInteger(input.price) || input.price <= 0) throw new OrderError("Precio al socio inválido.");
    price = input.price;
    markupBp = null;
  }
  if (cp.campaign.pricingModel === "TEXTIL_ADVANCE" && textilPrice && price < textilPrice)
    throw new OrderError(`${cp.product.name}: el precio al socio no puede ser menor que el precio textil.`);
  // Un cambio de precio del club después de la autorización vuelve a requerirla.
  const reopen = cp.campaign.status === "ACTIVATION_APPROVED" && user.role !== "TEXTIL_ADMIN" && (price !== cp.price || textilPrice !== cp.textilPrice);
  await db.$transaction([
    db.campaignProduct.update({ where: { id: cp.id }, data: { textilPrice, price, markupBp } }),
    ...(reopen ? [db.campaign.update({ where: { id: cp.campaignId }, data: { status: "ACTIVATION_REQUESTED", activationApprovedAt: null, activationApprovedById: null } })] : []),
  ]);
  await audit(actor, {
    entity: "Campaign", entityId: cp.campaignId, clubId: cp.campaign.clubId, action: "campaign.prices",
    data: { product: cp.productId, textil: [cp.textilPrice, textilPrice], price: [cp.price, price], markupBp, reopened: reopen },
  });
  return { textilPrice, price, markupBp, reopened: reopen };
}

export type RuleInput = {
  ruleType: ProductionRuleType; ruleCategoryId?: string | null; expectedQty?: number | null;
  initialPurchaseMin?: number | null; initialPurchaseEstimated?: boolean; initialPurchaseWaived?: boolean;
  clubPurchaseId?: string | null; ruleNote?: string | null;
};

/** Regla de producción de un producto en la campaña (la define la textil). Cambiarla quita la aprobación previa. */
export async function setProductRule(user: SessionUser, actor: Actor, campaignProductId: string, r: RuleInput) {
  if (user.role !== "TEXTIL_ADMIN") throw new OrderError("Las reglas de producción las define la textil.");
  const cp = await db.campaignProduct.findUniqueOrThrow({ where: { id: campaignProductId }, include: { campaign: true } });
  if (!isEditable(cp.campaign.status)) throw new OrderError("La regla no se cambia con la campaña publicada.");
  if (r.ruleType === "FULL_CATEGORY") {
    if (!r.ruleCategoryId) throw new OrderError("Elegí la categoría.");
    const cat = await db.category.findFirst({ where: { id: r.ruleCategoryId, clubId: cp.campaign.clubId } });
    if (!cat) throw new OrderError("La categoría no es de este club.");
    if (!r.expectedQty || r.expectedQty < 1 || r.expectedQty > 500) throw new OrderError("Indicá la cantidad esperada de la categoría.");
  }
  if (r.ruleType === "INITIAL_PURCHASE" && !r.initialPurchaseWaived && (!r.initialPurchaseMin || r.initialPurchaseMin < 1))
    throw new OrderError("Indicá la compra inicial mínima.");
  if (r.clubPurchaseId) {
    const p = await db.clubPurchase.findFirst({ where: { id: r.clubPurchaseId, clubId: cp.campaign.clubId } });
    if (!p) throw new OrderError("La compra no es de este club.");
  }
  const data = {
    ruleType: r.ruleType,
    ruleCategoryId: r.ruleType === "FULL_CATEGORY" ? r.ruleCategoryId! : null,
    expectedQty: r.ruleType === "FULL_CATEGORY" ? r.expectedQty! : null,
    initialPurchaseMin: r.ruleType === "INITIAL_PURCHASE" ? (r.initialPurchaseMin ?? null) : null,
    initialPurchaseEstimated: r.initialPurchaseEstimated ?? true,
    initialPurchaseWaived: r.ruleType === "INITIAL_PURCHASE" ? Boolean(r.initialPurchaseWaived) : false,
    clubPurchaseId: r.ruleType === "INITIAL_PURCHASE" ? (r.clubPurchaseId ?? null) : null,
    ruleNote: r.ruleNote?.trim() || null,
  };
  const changed = (["ruleType", "ruleCategoryId", "expectedQty", "initialPurchaseMin", "initialPurchaseWaived", "clubPurchaseId"] as const).some(
    (k) => (cp as Record<string, unknown>)[k] !== data[k],
  );
  await db.campaignProduct.update({ where: { id: cp.id }, data: { ...data, ...(changed ? { ruleApprovedAt: null, ruleApprovedById: null, productionApprovedAt: null } : {}) } });
  await audit(actor, { entity: "Campaign", entityId: cp.campaignId, clubId: cp.campaign.clubId, action: "campaign.rule", data: { product: cp.productId, ...data } });
}

/** Aprobación explícita de la textil: abrir (regla) o producir con menos de lo esperado (categoría completa). */
export async function approveProductRule(user: SessionUser, actor: Actor, campaignProductId: string, what: "open" | "production", note: string) {
  if (user.role !== "TEXTIL_ADMIN") throw new OrderError("Solo la textil aprueba reglas de producción.");
  const cp = await db.campaignProduct.findUniqueOrThrow({ where: { id: campaignProductId }, include: { campaign: true, product: true, ruleCategory: true } });
  if (cp.ruleType === "NONE") throw new OrderError("El producto no tiene regla de producción.");
  if (what === "production") {
    if (cp.ruleType !== "FULL_CATEGORY") throw new OrderError("La aprobación de producción aplica a campañas de categoría completa.");
    if (note.trim().length < 5) throw new OrderError("Explicá la excepción: queda registrada.");
    await db.campaignProduct.update({ where: { id: cp.id }, data: { productionApprovedAt: new Date(), ruleNote: note.trim() } });
  } else {
    if (cp.ruleType === "INITIAL_PURCHASE" && cp.initialPurchaseWaived && note.trim().length < 5) throw new OrderError("Explicá la excepción a la compra inicial.");
    await db.campaignProduct.update({ where: { id: cp.id }, data: { ruleApprovedAt: new Date(), ruleApprovedById: user.id, ...(note.trim() ? { ruleNote: note.trim() } : {}) } });
  }
  await audit(actor, { entity: "Campaign", entityId: cp.campaignId, clubId: cp.campaign.clubId, action: "campaign.rule_approved", data: { product: cp.productId, what, note: note.trim() || null } });
}

/** Estado de cada regla de producción para el panel y para generar lotes. */
export async function productionRuleStatus(campaignId: string) {
  const cps = await db.campaignProduct.findMany({
    where: { campaignId, ruleType: { not: "NONE" } },
    include: { product: { select: { name: true } }, ruleCategory: true, clubPurchase: true },
  });
  return Promise.all(
    cps.map(async (cp) => {
      const confirmed = await confirmedUnits(campaignId, cp.productId, cp.ruleType === "FULL_CATEGORY" ? cp.ruleCategory?.name : null);
      const open = ruleOpenProblems(cp, cp.product.name);
      const canProduce =
        cp.ruleType === "FULL_CATEGORY"
          ? Boolean(cp.ruleApprovedAt) && (confirmed >= (cp.expectedQty ?? Infinity) || Boolean(cp.productionApprovedAt))
          : open.length === 0;
      return {
        id: cp.id, productId: cp.productId, product: cp.product.name, ruleType: cp.ruleType, category: cp.ruleCategory?.name ?? null,
        expectedQty: cp.expectedQty, confirmed, initialPurchaseMin: cp.initialPurchaseMin, initialPurchaseEstimated: cp.initialPurchaseEstimated,
        waived: cp.initialPurchaseWaived, purchase: cp.clubPurchase, ruleApprovedAt: cp.ruleApprovedAt, productionApprovedAt: cp.productionApprovedAt,
        note: cp.ruleNote, openProblems: open, canProduce,
      };
    }),
  );
}

/** Alcance de la campaña: todo el club, disciplinas o categorías. */
export async function setAudience(user: SessionUser, actor: Actor, campaignId: string, audience: CampaignAudience, sportIds: string[], categoryIds: string[]) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  assertClubOrTextil(user, c.clubId);
  if (!isEditable(c.status)) throw new OrderError("El alcance no se cambia con la campaña publicada.");
  if (audience === "SPORTS" && !sportIds.length) throw new OrderError("Elegí al menos una disciplina.");
  if (audience === "CATEGORIES" && !categoryIds.length) throw new OrderError("Elegí al menos una categoría.");
  const cats = categoryIds.length ? await db.category.findMany({ where: { id: { in: categoryIds }, clubId: c.clubId } }) : [];
  if (cats.length !== categoryIds.length) throw new OrderError("Alguna categoría no es de este club.");
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      audience,
      audienceSports: { set: audience === "SPORTS" ? sportIds.map((id) => ({ id })) : [] },
      audienceCategories: { set: audience === "CATEGORIES" ? categoryIds.map((id) => ({ id })) : [] },
    },
  });
  await audit(actor, { entity: "Campaign", entityId: campaignId, clubId: c.clubId, action: "campaign.audience", data: { audience, sportIds, categoryIds } });
}
