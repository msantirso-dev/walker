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
import { requireUser, assertCan, actorOf, clientIp } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { publishCampaign, closeCampaign, finishCampaign, cancelCampaign, decideMinimum } from "@/modules/campaigns";
import { setBenefitRule, addSettlement } from "@/modules/benefits";
import { generateLot } from "@/modules/production";
import type { MinDecision } from "@/generated/prisma/client";

async function manager() {
  const u = await requireUser();
  assertCan(u, "campaign.manage");
  return { u, actor: actorOf(u, await clientIp()) };
}

async function accountFor(clubId: string, accountId: string) {
  const acc = await db.paymentAccount.findUnique({ where: { id: accountId } });
  if (!acc || (acc.owner === "CLUB" && acc.clubId !== clubId)) throw new UserError("La cuenta de cobro no corresponde a este club.");
  return acc;
}

export async function createCampaign(_p: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  const res = await run(async () => {
    const { actor } = await manager();
    const clubId = str(fd, "clubId");
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
    const acc = await accountFor(clubId, str(fd, "paymentAccountId"));
    const c = await db.campaign.create({ data: { clubId, slug, title, season: opt(fd, "season"), opensAt, closesAt, paymentAccountId: acc.id } });
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
    const pickupEnabled = bool(fd, "pickupEnabled");
    const shippingEnabled = bool(fd, "shippingEnabled");
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
    const { actor } = await manager();
    const c = await db.campaign.findUniqueOrThrow({ where: { id }, include: { products: true } });
    const ops = [];
    const changes: Record<string, unknown>[] = [];
    for (const cp of c.products) {
      const price = parsePesos(str(fd, `price_${cp.id}`));
      if (!price || price <= 0) throw new UserError("Todos los productos de la colección necesitan precio de preventa.");
      const listPrice = parsePesos(str(fd, `list_${cp.id}`));
      const maxUnits = intOrNull(fd, `max_${cp.id}`);
      const active = bool(fd, `active_${cp.id}`);
      if (price !== cp.price) changes.push({ product: cp.productId, from: cp.price, to: price });
      ops.push(db.campaignProduct.update({ where: { id: cp.id }, data: { price, listPrice, maxUnits, active, sort: int(fd, `sort_${cp.id}`, cp.sort) } }));
    }
    const addId = str(fd, "addProduct");
    if (addId) {
      const p = await db.product.findFirst({ where: { id: addId, clubId: c.clubId } });
      if (!p) throw new UserError("Producto inválido.");
      if (c.products.some((x) => x.productId === addId)) throw new UserError("El producto ya está en la colección.");
      const price = parsePesos(str(fd, "addPrice")) ?? p.basePrice;
      ops.push(db.campaignProduct.create({ data: { campaignId: id, productId: addId, price, listPrice: p.basePrice > price ? p.basePrice : null, sort: c.products.length } }));
    }
    await db.$transaction(ops);
    await audit(actor, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "campaign.collection", data: { priceChanges: changes, added: addId || null } as never });
    revalidatePath(`/admin/campanas/${id}/editar`);
    return changes.length ? "Colección guardada. Los pedidos ya hechos conservan el precio con el que se compraron." : "Colección guardada.";
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
    const { actor } = await manager();
    if (action === "publish") await publishCampaign(actor, id);
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
