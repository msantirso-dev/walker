"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/db";
import { run, str, opt, bool, int, intOrNull, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { parsePesos } from "@/shared/money";
import { parseArLocal } from "@/shared/dates";
import { SLUG_RE, slugify } from "@/shared/slug";
import { requireUser, assertCan, can, actorOf, clientIp } from "@/modules/auth";
import { audit } from "@/modules/audit";
import {
  publishCampaign, closeCampaign, finishCampaign, cancelCampaign, decideMinimum, requestActivation, approveActivation, rejectActivation,
  setCampaignProductPrices, setProductRule, approveProductRule, setAudience,
} from "@/modules/campaigns";
import { setBenefitRule, addSettlement } from "@/modules/benefits";
import { generateLot } from "@/modules/production";
import type { CampaignAudience, MinDecision, ProductionRuleType } from "@/generated/prisma/client";

async function manager() {
  const u = await requireUser();
  assertCan(u, "campaign.manage");
  return { u, actor: actorOf(u, await clientIp()) };
}

/** Textil (gestión total) o administrador del club dueño de la campaña (solicitud). */
async function editor(campaignId: string) {
  const u = await requireUser();
  const c = await db.campaign.findUnique({ where: { id: campaignId }, select: { clubId: true } });
  if (!c) throw new UserError("Campaña inexistente.");
  if (!can(u, "campaign.manage") && !can(u, "campaign.request", c.clubId)) assertCan(u, "campaign.manage");
  return { u, actor: actorOf(u, await clientIp()), textil: u.role === "TEXTIL_ADMIN" };
}

async function accountFor(clubId: string, accountId: string) {
  const acc = await db.paymentAccount.findUnique({ where: { id: accountId } });
  if (!acc || (acc.owner === "CLUB" && acc.clubId !== clubId)) throw new UserError("La cuenta de cobro no corresponde a este club.");
  return acc;
}

export async function createCampaign(_p: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  const res = await run(async () => {
    const u = await requireUser();
    const clubId = u.role === "CLUB_ADMIN" ? (u.clubId ?? "") : str(fd, "clubId");
    if (!can(u, "campaign.manage") && !can(u, "campaign.request", clubId)) assertCan(u, "campaign.manage");
    const actor = actorOf(u, await clientIp());
    const club = await db.club.findUnique({ where: { id: clubId } });
    if (!club) throw new UserError("Elegí un club.");
    const title = str(fd, "title");
    if (title.length < 3) throw new UserError("Escribí el título de la campaña.");
    const slug = str(fd, "slug") || slugify(title);
    if (!SLUG_RE.test(slug)) throw new UserError("La URL solo admite minúsculas, números y guiones.");
    if (await db.campaign.findUnique({ where: { clubId_slug: { clubId, slug } } })) throw new UserError("Ya existe una campaña con esa URL en el club.");
    const opensAt = parseArLocal(str(fd, "opensAt"));
    const closesAt = parseArLocal(str(fd, "closesAt"));
    if (!opensAt || !closesAt || closesAt <= opensAt) throw new UserError("Revisá las fechas: el cierre debe ser posterior a la apertura.");
    // Modelo v2: el anticipo se cobra en la cuenta de la textil; sin envío a domicilio; transferencia desactivada por defecto.
    const acc = u.role === "CLUB_ADMIN"
      ? await db.paymentAccount.findFirst({ where: { owner: "TEXTIL" }, orderBy: { createdAt: "asc" } })
      : await accountFor(clubId, str(fd, "paymentAccountId"));
    if (!acc) throw new UserError("No hay una cuenta de cobro de la textil configurada.");
    const c = await db.campaign.create({
      data: { clubId, slug, title, season: opt(fd, "season"), opensAt, closesAt, paymentAccountId: acc.id, pricingModel: "TEXTIL_ADVANCE", shippingEnabled: false, allowTransfer: false },
    });
    await audit(actor, { entity: "Campaign", entityId: c.id, clubId, action: "campaign.created", data: { title, receiver: acc.owner } });
    id = c.id;
  });
  if (id) redirect(`/admin/campanas/${id}/editar`);
  return res;
}

const faqParse = (raw: string) =>
  raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [q, ...a] = l.split("|");
      if (!q?.trim() || !a.join("|").trim()) throw new UserError(`Pregunta frecuente mal escrita: "${l.slice(0, 40)}…" (formato: Pregunta | Respuesta)`);
      return { q: q.trim(), a: a.join("|").trim() };
    });

export async function updateCampaign(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await manager();
    const c = await db.campaign.findUniqueOrThrow({ where: { id } });
    const opensAt = parseArLocal(str(fd, "opensAt"));
    const closesAt = parseArLocal(str(fd, "closesAt"));
    if (!opensAt || !closesAt || closesAt <= opensAt) throw new UserError("Revisá las fechas: el cierre debe ser posterior a la apertura.");
    const slug = str(fd, "slug");
    if (!SLUG_RE.test(slug)) throw new UserError("La URL solo admite minúsculas, números y guiones.");
    const other = await db.campaign.findUnique({ where: { clubId_slug: { clubId: c.clubId, slug } } });
    if (other && other.id !== id) throw new UserError("Ya existe una campaña con esa URL.");
    const acc = await accountFor(c.clubId, str(fd, "paymentAccountId"));
    if (acc.id !== c.paymentAccountId && (await db.payment.count({ where: { order: { campaignId: id } } })) > 0)
      throw new UserError("La campaña ya tiene pagos: no se puede cambiar el destinatario de los cobros.");

    const paymentMode = str(fd, "paymentMode") === "FULL" ? "FULL" : "DEPOSIT";
    const depositType = str(fd, "depositType") === "FIXED" ? "FIXED" : "PERCENT";
    const depositValue = depositType === "PERCENT" ? int(fd, "depositPercent", 50) : parsePesos(str(fd, "depositFixed")) ?? 0;
    if (paymentMode === "DEPOSIT" && depositType === "PERCENT" && (depositValue < 1 || depositValue > 99)) throw new UserError("La seña debe estar entre 1 % y 99 %.");
    if (paymentMode === "DEPOSIT" && depositType === "FIXED" && depositValue <= 0) throw new UserError("Indicá el importe fijo de la seña.");

    const schema = z.object({
      deliveryDaysMin: z.number().int().min(1).max(365),
      deliveryDaysMax: z.number().int().min(1).max(365),
      mpReservationMinutes: z.number().int().min(10).max(1440),
      transferHoldHours: z.number().int().min(1).max(720),
      minUnits: z.number().int().min(1).nullable(),
      maxUnits: z.number().int().min(1).nullable(),
      shippingPrice: z.number().int().min(0),
    });
    const nums = schema.parse({
      deliveryDaysMin: int(fd, "deliveryDaysMin", 30), deliveryDaysMax: int(fd, "deliveryDaysMax", 40), mpReservationMinutes: int(fd, "mpReservationMinutes", 30),
      transferHoldHours: int(fd, "transferHoldHours", 72), minUnits: intOrNull(fd, "minUnits"), maxUnits: intOrNull(fd, "maxUnits"), shippingPrice: parsePesos(str(fd, "shippingPrice")) ?? 0,
    });
    if (nums.deliveryDaysMax < nums.deliveryDaysMin) throw new UserError("El plazo máximo de entrega no puede ser menor que el mínimo.");
    if (nums.minUnits && nums.maxUnits && nums.maxUnits < nums.minUnits) throw new UserError("El cupo no puede ser menor que el mínimo de producción.");
    const advance = c.pricingModel === "TEXTIL_ADVANCE";
    const pickupEnabled = advance ? true : bool(fd, "pickupEnabled");
    const shippingEnabled = advance ? false : bool(fd, "shippingEnabled");
    if (!pickupEnabled && !shippingEnabled) throw new UserError("Habilitá retiro, envío o ambos.");
    const allowMercadoPago = bool(fd, "allowMercadoPago");
    const allowTransfer = bool(fd, "allowTransfer");
    if (!allowMercadoPago && !allowTransfer) throw new UserError("Habilitá al menos un medio de pago.");

    const data = {
      title: str(fd, "title"), slug, season: opt(fd, "season"), description: opt(fd, "description"), opensAt, closesAt,
      showCatalogWhenClosed: bool(fd, "showCatalogWhenClosed"), paymentAccountId: acc.id, paymentMode, depositType, depositValue,
      balanceDueText: opt(fd, "balanceDueText"), allowMercadoPago, allowTransfer, lotCondition: str(fd, "lotCondition") === "FULLY_PAID" ? "FULLY_PAID" : "DEPOSIT_APPROVED",
      pickupEnabled, pickupInstructions: opt(fd, "pickupInstructions"), shippingEnabled, shippingNotes: opt(fd, "shippingNotes"),
      memberNumberMode: ["HIDDEN", "OPTIONAL", "REQUIRED"].includes(str(fd, "memberNumberMode")) ? str(fd, "memberNumberMode") : "OPTIONAL",
      policyChanges: opt(fd, "policyChanges"), policyCancellation: opt(fd, "policyCancellation"), policyRefunds: opt(fd, "policyRefunds"),
      minPolicyText: opt(fd, "minPolicyText"), faq: faqParse(str(fd, "faq")), ...nums,
    } as const;
    if (data.title.length < 3) throw new UserError("Escribí el título de la campaña.");
    if (data.minUnits && !data.minPolicyText) throw new UserError("Con mínimo de producción, explicá públicamente qué pasa si no se alcanza.");
    await db.campaign.update({ where: { id }, data });
    await audit(actor, {
      entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.updated",
      data: { deposit: [c.paymentMode, c.depositType, c.depositValue, "→", paymentMode, depositType, depositValue], closesAt: closesAt.toISOString(), receiver: acc.id },
    });
    revalidatePath(`/admin/campanas/${id}`);
  });
}

export async function saveCollection(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor, textil } = await editor(id);
    const c = await db.campaign.findUniqueOrThrow({ where: { id }, include: { products: true } });
    const advance = c.pricingModel === "TEXTIL_ADVANCE";
    const changes: Record<string, unknown>[] = [];
    const ops = [];
    for (const cp of c.products) {
      if (advance) {
        const tRaw = str(fd, `textil_${cp.id}`);
        const tp = textil && tRaw ? parsePesos(tRaw) : undefined;
        if (textil && tRaw && !tp) throw new UserError("Precio textil inválido.");
        const mk = str(fd, `markup_${cp.id}`).replace(",", ".");
        const price = parsePesos(str(fd, `price_${cp.id}`));
        const input = mk ? { markupPercent: Number(mk) } : { price: price ?? null };
        const textilChanged = tp !== undefined && tp !== cp.textilPrice;
        const priceChanged = mk ? Math.round(Number(mk) * 100) !== cp.markupBp : (price ?? null) !== cp.price || cp.markupBp != null;
        if (textilChanged || priceChanged) {
          const r = await setCampaignProductPrices(u, actor, cp.id, { ...(textilChanged ? { textilPrice: tp } : {}), ...input });
          changes.push({ product: cp.productId, textil: r.textilPrice, price: r.price, reopened: r.reopened });
        }
      } else if (textil) {
        const price = parsePesos(str(fd, `price_${cp.id}`));
        if (!price || price <= 0) throw new UserError("Todos los productos de la colección necesitan precio de preventa.");
        if (price !== cp.price) changes.push({ product: cp.productId, from: cp.price, to: price });
        ops.push(db.campaignProduct.update({ where: { id: cp.id }, data: { price } }));
      }
      if (textil) {
        ops.push(db.campaignProduct.update({
          where: { id: cp.id },
          data: { listPrice: parsePesos(str(fd, `list_${cp.id}`)), maxUnits: intOrNull(fd, `max_${cp.id}`), active: bool(fd, `active_${cp.id}`), sort: int(fd, `sort_${cp.id}`, cp.sort) },
        }));
      }
    }
    const addId = str(fd, "addProduct");
    if (addId) {
      if (!["DRAFT", "ACTIVATION_REQUESTED"].includes(c.status) && !textil) throw new UserError("Con la campaña autorizada, solo la textil agrega productos.");
      const p = await db.product.findFirst({ where: { id: addId, clubId: c.clubId, active: true } });
      if (!p) throw new UserError("Producto inválido.");
      if (!textil && !["CATALOG", "PRESALE", "PRESALE_CLOSED"].includes(p.catalogStatus)) throw new UserError("Ese producto todavía está en preparación.");
      if (c.products.some((x) => x.productId === addId)) throw new UserError("El producto ya está en la colección.");
      const price = parsePesos(str(fd, "addPrice")) ?? p.basePrice;
      ops.push(db.campaignProduct.create({
        data: {
          campaignId: id, productId: addId, price, listPrice: !advance && p.basePrice > price ? p.basePrice : null, sort: c.products.length,
          // Outfit: compra inicial sugerida (estimada, editable). Nunca se aprueba sola.
          ...(advance && p.family === "OUTFIT" ? { ruleType: "INITIAL_PURCHASE" as const, initialPurchaseMin: 15, initialPurchaseEstimated: true } : {}),
        },
      }));
    }
    if (ops.length) await db.$transaction(ops);
    await audit(actor, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.collection", data: { priceChanges: changes, added: addId || null } as never });
    revalidatePath(`/admin/campanas/${id}/editar`);
    revalidatePath(`/admin/campanas/${id}`);
    if (changes.some((x) => x.reopened)) return "Precios guardados. Como cambiaron después de la autorización, la textil tiene que volver a autorizar la campaña.";
    return changes.length ? "Colección guardada. Los pedidos ya hechos conservan el precio con el que se compraron." : "Colección guardada.";
  });
}

export async function saveRuleAction(id: string, cpId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor } = await editor(id);
    const t = str(fd, "ruleType") as ProductionRuleType;
    if (!["NONE", "FULL_CATEGORY", "INITIAL_PURCHASE"].includes(t)) throw new UserError("Regla inválida.");
    await setProductRule(u, actor, cpId, {
      ruleType: t, ruleCategoryId: str(fd, "ruleCategoryId") || null, expectedQty: intOrNull(fd, "expectedQty"),
      initialPurchaseMin: intOrNull(fd, "initialPurchaseMin"), initialPurchaseEstimated: bool(fd, "initialPurchaseEstimated"),
      initialPurchaseWaived: bool(fd, "initialPurchaseWaived"), clubPurchaseId: str(fd, "clubPurchaseId") || null, ruleNote: opt(fd, "ruleNote"),
    });
    revalidatePath(`/admin/campanas/${id}/editar`);
    return "Regla guardada. Si cambió, necesita aprobarse de nuevo.";
  });
}

export async function approveRuleAction(id: string, cpId: string, what: "open" | "production", _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor } = await editor(id);
    await approveProductRule(u, actor, cpId, what, str(fd, "note"));
    revalidatePath(`/admin/campanas/${id}/editar`);
    revalidatePath(`/admin/campanas/${id}`);
    return what === "open" ? "Regla aprobada." : "Producción aprobada como excepción.";
  });
}

export async function audienceAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor } = await editor(id);
    const a = str(fd, "audience") as CampaignAudience;
    if (!["ALL", "SPORTS", "CATEGORIES"].includes(a)) throw new UserError("Alcance inválido.");
    await setAudience(u, actor, id, a, fd.getAll("sportIds").map(String), fd.getAll("categoryIds").map(String));
    revalidatePath(`/admin/campanas/${id}/editar`);
    return "Alcance guardado.";
  });
}

export async function activationAction(id: string, action: "request" | "approve" | "reject", _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor } = await editor(id);
    if (action === "request") await requestActivation(u, actor, id, str(fd, "note") || undefined);
    if (action === "approve") await approveActivation(u, actor, id);
    if (action === "reject") await rejectActivation(u, actor, id, str(fd, "reason"));
    revalidatePath(`/admin/campanas/${id}`);
    return { request: "Activación solicitada. La textil la revisa y autoriza.", approve: "Activación autorizada. Ya se puede publicar.", reject: "Solicitud devuelta al club con el motivo." }[action];
  });
}

export async function saveBenefit(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await manager();
    const type = str(fd, "benefitType");
    if (!type) return void (await setBenefitRule(actor, id, null));
    if (type === "FIXED_PER_UNIT") {
      const v = parsePesos(str(fd, "benefitFixed"));
      if (!v) throw new UserError("Indicá el importe por prenda.");
      await setBenefitRule(actor, id, { type, value: v, notes: opt(fd, "benefitNotes") ?? undefined });
    } else if (type === "PERCENT_OF_GARMENTS") {
      const pct = Number(str(fd, "benefitPercent").replace(",", "."));
      if (!Number.isFinite(pct) || pct <= 0) throw new UserError("Indicá el porcentaje.");
      await setBenefitRule(actor, id, { type, value: Math.round(pct * 100), notes: opt(fd, "benefitNotes") ?? undefined });
    }
    revalidatePath(`/admin/campanas/${id}`);
    return "Regla de beneficio guardada. Aplica a los pedidos que se confirmen desde ahora.";
  });
}

export async function campaignAction(id: string, action: "publish" | "close" | "finish", _p: FormState, _fd: FormData): Promise<FormState> {
  return run(async () => {
    if (action === "publish") {
      // Con la activación autorizada por la textil, el club también puede publicar (elige el momento).
      const { actor, textil } = await editor(id);
      const c = await db.campaign.findUniqueOrThrow({ where: { id }, select: { pricingModel: true } });
      if (!textil && c.pricingModel !== "TEXTIL_ADVANCE") throw new UserError("Solo la textil publica campañas del modelo anterior.");
      await publishCampaign(actor, id);
      revalidatePath(`/admin/campanas/${id}`);
      return "Campaña publicada.";
    }
    const { actor } = await manager();
    if (action === "close") await closeCampaign(actor, id);
    if (action === "finish") await finishCampaign(actor, id);
    revalidatePath(`/admin/campanas/${id}`);
    return { publish: "Campaña publicada.", close: "Campaña cerrada: no se aceptan nuevas compras.", finish: "Campaña finalizada." }[action];
  });
}

export async function cancelCampaignAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await manager();
    await cancelCampaign(actor, id, str(fd, "reason"));
    revalidatePath(`/admin/campanas/${id}`);
    return "Campaña cancelada. Los pedidos no se cancelan solos: cancelalos y registrá las devoluciones uno por uno.";
  });
}

export async function minDecisionAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor } = await manager();
    const d = str(fd, "decision") as MinDecision;
    if (!["EXTEND", "CANCEL", "CONTINUE"].includes(d)) throw new UserError("Elegí una decisión.");
    await decideMinimum({ ...actor, id: u.id }, id, d, str(fd, "note"), parseArLocal(str(fd, "newCloseAt")));
    revalidatePath(`/admin/campanas/${id}`);
    return "Decisión registrada.";
  });
}

export async function settlementAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "benefit.settle");
    const amount = parsePesos(str(fd, "amount"));
    const at = parseArLocal(`${str(fd, "date")}T12:00`);
    if (!amount || !at) throw new UserError("Indicá importe y fecha.");
    await addSettlement({ ...actorOf(u, await clientIp()), id: u.id }, id, { amount, settledAt: at, reference: opt(fd, "reference") ?? undefined, notes: opt(fd, "notes") ?? undefined });
    revalidatePath(`/admin/campanas/${id}`);
    return "Liquidación registrada.";
  });
}

export async function generateLotAction(id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  let lotId = "";
  const res = await run(async () => {
    const u = await requireUser();
    assertCan(u, "production.plan");
    const lot = await generateLot({ ...actorOf(u, await clientIp()), id: u.id }, id);
    lotId = lot.id;
  });
  if (lotId) redirect(`/admin/produccion/${lotId}`);
  return res;
}

export async function productionNoticeAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await manager();
    const c = await db.campaign.update({ where: { id }, data: { productionNotice: opt(fd, "productionNotice") } });
    await audit(actor, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.notice" });
    revalidatePath(`/admin/campanas/${id}`);
    return "Aviso publicado en el seguimiento de los compradores.";
  });
}
