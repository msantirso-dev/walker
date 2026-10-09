import "server-only";
import { db } from "@/shared/db";
import { heldUnits } from "@/modules/orders/capacity";
import { isWindowOpen, optionGroupsInclude, audienceText } from "@/modules/orders/pricing";
import { sampleInfoForProducts } from "@/modules/samples";
import type { OptionGroupT } from "@/modules/catalog/options";
import { onlineMode } from "@/modules/payments/accounts";
import { readableOn } from "@/shared/colors";
import type { CSSProperties } from "react";

export function clubTheme(c: { colorPrimary: string; colorSecondary: string }) {
  return {
    "--club": c.colorPrimary,
    "--on-club": readableOn(c.colorPrimary),
    "--club-2": c.colorSecondary,
    "--on-club-2": readableOn(c.colorSecondary),
  } as CSSProperties;
}

/** Única parte pública del acuerdo: la línea de marca ("Club by Marca"), si hay un acuerdo vigente. */
async function brandLineFor(clubId: string) {
  const now = new Date();
  const a = await db.clubAgreement.findFirst({ where: { clubId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } }, select: { brandLine: true } });
  return a?.brandLine ?? null;
}

export async function getClubStore(slug: string) {
  const club = await db.club.findUnique({
    where: { slug },
    include: {
      sports: { include: { sport: true } },
      photos: { orderBy: { sort: "asc" } },
      campaigns: { where: { status: { notIn: ["DRAFT", "ACTIVATION_REQUESTED", "ACTIVATION_APPROVED"] } }, orderBy: { opensAt: "desc" }, select: { id: true, slug: true, title: true, season: true, status: true, opensAt: true, closesAt: true, description: true, showCatalogWhenClosed: true, deliveryDaysMin: true, deliveryDaysMax: true, paymentMode: true, pricingModel: true, depositType: true, depositValue: true, faq: true, audience: true, audienceSports: { select: { name: true } }, audienceCategories: { select: { name: true, sport: { select: { name: true } } } }, products: { where: { active: true }, select: { productId: true, price: true } } } },
    },
  });
  if (!club || !club.active) return null;
  // La hora del servidor decide qué está abierto, próximo o finalizado
  const now = new Date();
  // Todas las preventas abiertas, cada una con su alcance (el socio ve qué puede comprar)
  const openList = club.campaigns.filter((c) => c.status === "PUBLISHED" && c.closesAt > now && c.opensAt <= now).map((c) => ({ ...c, audienceText: audienceText(c) }));
  const current = openList.find((c) => c.audience === "ALL") ?? openList[0] ?? null;
  // Catálogo del club: productos visibles sin preventa abierta (catálogo sin venta, preventa cerrada)
  const catalog = await db.product.findMany({
    where: { clubId: club.id, active: true, catalogStatus: { in: ["CATALOG", "PRESALE", "PRESALE_CLOSED"] } },
    orderBy: [{ catalogStatus: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, description: true, catalogStatus: true, images: { orderBy: { sort: "asc" }, take: 1, select: { url: true, alt: true, tag: true } } },
  });
  // Producto en preventa → campaña abierta que lo vende (para enlazar y mostrar el cierre)
  const saleOf = new Map<string, { slug: string; closesAt: Date; audienceText: string; audience: string; price: number }>();
  for (const c of openList) for (const p of c.products) if (!saleOf.has(p.productId)) saleOf.set(p.productId, { slug: c.slug, closesAt: c.closesAt, audienceText: c.audienceText, audience: c.audience, price: p.price });
  // Campañas programadas (abren más adelante) y productos de preventas ya finalizadas
  const upcoming = club.campaigns.filter((c) => c.status === "PUBLISHED" && c.opensAt > now).map((c) => ({ ...c, audienceText: audienceText(c) }));
  const upcomingOf = new Map<string, Date>();
  for (const c of upcoming) for (const p of c.products) if (!upcomingOf.has(p.productId) || upcomingOf.get(p.productId)! > c.opensAt) upcomingOf.set(p.productId, c.opensAt);
  const endedIds = new Set(club.campaigns.filter((c) => c.closesAt <= now && c.status !== "CANCELLED").flatMap((c) => c.products.map((p) => p.productId)));
  const openIds = new Set(openList.map((c) => c.id));
  const upcomingIds = new Set(upcoming.map((c) => c.id));
  return {
    club, current, openList, upcoming, history: club.campaigns.filter((c) => !openIds.has(c.id) && !upcomingIds.has(c.id)),
    catalog: catalog.map((p) => {
      const sale = saleOf.get(p.id) ?? null;
      const opensAt = upcomingOf.get(p.id) ?? null;
      const state: StoreItemState = sale ? "ACTIVE" : opensAt || p.catalogStatus === "CATALOG" || !endedIds.has(p.id) ? "SOON" : "ENDED";
      return { ...p, sale, opensAt, state };
    }),
    brandLine: await brandLineFor(club.id),
  };
}

/** Estado público de un producto: activo (se compra), próximamente (atenuado, sin compra) o preventa finalizada. */
export type StoreItemState = "ACTIVE" | "SOON" | "ENDED";
export const ITEM_STATE_LABEL: Record<StoreItemState, string> = { ACTIVE: "En preventa", SOON: "Próximamente", ENDED: "Preventa finalizada" };

export const CATALOG_PUBLIC_LABEL: Record<string, string> = { CATALOG: "Próximamente", PRESALE: "En preventa", PRESALE_CLOSED: "Preventa finalizada" };

export type StoreSize = { label: string; group: string; a: number | null; b: number | null };
export type StoreComponent = { label: string; garmentCode: string; garmentName: string; variant: string | null; material: string | null; care: string | null; measureA: string; measureB: string; unit: string; note: string | null; printTarget: boolean; sizes: StoreSize[] };
export type StoreProduct = {
  id: string; code: string; name: string; kind: string; description: string | null; audience: string | null; sport: string | null; manufacturingTerms: string | null;
  price: number; listPrice: number | null; remaining: number | null;
  /** Anticipo por prenda (precio de la empresa). Null en campañas con seña heredada. */
  textilPrice: number | null;
  /** Cobertura impositiva del anticipo (v2); el comprador no ve el desglose */
  clubTaxBp: number | null;
  family: string;
  optionGroups: OptionGroupT[];
  /** Curvas del muestrario aprobadas y disponibles en el club */
  samples: { kind: string; location: string | null; sizes: string[] }[];
  pers: { name: boolean; namePrice: number; nameMax: number; number: boolean; numberPrice: number; numberMin: number; numberMax: number };
  images: { url: string; view: string; tag: string; alt: string | null }[];
  components: StoreComponent[];
};

export async function getCampaignStore(clubSlug: string, campaignSlug: string) {
  const club = await db.club.findUnique({
    where: { slug: clubSlug },
    include: { sports: { include: { sport: true } }, categories: { where: { active: true }, orderBy: { sort: "asc" }, include: { sport: true } } },
  });
  if (!club || !club.active) return null;
  const c = await db.campaign.findUnique({
    where: { clubId_slug: { clubId: club.id, slug: campaignSlug } },
    include: {
      paymentAccount: true,
      audienceSports: true,
      audienceCategories: { include: { sport: true } },
      products: {
        where: { active: true, product: { active: true } },
        orderBy: { sort: "asc" },
        include: {
          product: {
            include: {
              sport: true,
              optionGroups: optionGroupsInclude,
              images: { orderBy: { sort: "asc" } },
              components: { orderBy: { sort: "asc" }, include: { garment: { include: { sizes: { where: { enabled: true }, orderBy: { sort: "asc" } } } } } },
            },
          },
        },
      },
    },
  });
  if (!c || ["DRAFT", "ACTIVATION_REQUESTED", "ACTIVATION_APPROVED"].includes(c.status)) return null;
  const samples = await sampleInfoForProducts(c.products.map((cp) => cp.productId));

  const open = isWindowOpen(c);
  const limited = c.maxUnits != null || c.products.some((p) => p.maxUnits != null);
  const held = limited ? await heldUnits(c.id) : null;
  const campaignLeft = c.maxUnits != null && held ? Math.max(0, c.maxUnits - held.total) : null;

  const products: StoreProduct[] = c.products.map((cp) => {
    const p = cp.product;
    let remaining: number | null = null;
    if (held && cp.maxUnits != null) remaining = Math.max(0, cp.maxUnits - (held.byProduct.get(p.id) ?? 0));
    if (campaignLeft != null) remaining = remaining == null ? campaignLeft : Math.min(remaining, campaignLeft);
    return {
      id: p.id, code: p.code, name: p.name, kind: p.kind, description: p.description, audience: p.audience, sport: p.sport?.name ?? null, manufacturingTerms: p.manufacturingTerms,
      price: cp.price, listPrice: cp.listPrice && cp.listPrice > cp.price ? cp.listPrice : null, remaining,
      textilPrice: c.pricingModel === "TEXTIL_ADVANCE" ? cp.textilPrice : null,
      clubTaxBp: c.pricingModel === "TEXTIL_ADVANCE" ? c.clubTaxBp : null,
      family: p.family,
      optionGroups: p.optionGroups.map((g) => ({
        id: g.id, name: g.name, type: g.type, role: g.role, required: g.required, sort: g.sort, help: g.help, dependsOnGroupId: g.dependsOnGroupId,
        dependsOnValueIds: g.dependsOnValueIds, maxLength: g.maxLength, numberMin: g.numberMin, numberMax: g.numberMax, priceTextil: g.priceTextil,
        priceClub: g.priceClub, blocksSizeChange: g.blocksSizeChange,
        values: g.values.filter((v) => v.active).map((v) => ({ id: v.id, label: v.label, sort: v.sort, priceTextil: v.priceTextil, priceClub: v.priceClub, active: v.active })),
      })),
      samples: samples.get(p.id) ?? [],
      pers: { name: p.persNameEnabled, namePrice: p.persNamePrice, nameMax: p.persNameMaxLen, number: p.persNumberEnabled, numberPrice: p.persNumberPrice, numberMin: p.persNumberMin, numberMax: p.persNumberMax },
      images: p.images.map((i) => ({ url: i.url, view: i.view, tag: i.tag, alt: i.alt })),
      components: p.components.map((comp) => ({
        label: comp.label, garmentCode: comp.garment.code, garmentName: comp.garment.name, variant: comp.garment.variant, material: comp.garment.material, care: comp.garment.care,
        measureA: comp.garment.measureA, measureB: comp.garment.measureB, unit: comp.garment.measureUnit, note: comp.garment.measureNote, printTarget: comp.printTarget,
        sizes: comp.garment.sizes.map((s) => ({ label: s.label, group: s.group, a: s.measureA ? Number(s.measureA) : null, b: s.measureB ? Number(s.measureB) : null })),
      })),
    };
  });

  const confirmedUnits = c.minUnits ? await db.orderUnit.count({ where: { status: "ACTIVE", order: { campaignId: c.id, status: "CONFIRMED" } } }) : 0;
  const mode = onlineMode(c.paymentAccount);
  return {
    club,
    campaign: c,
    open,
    products,
    confirmedUnits,
    audience: audienceText(c),
    brandLine: await brandLineFor(club.id),
    payments: {
      mercadopago: c.allowMercadoPago && mode !== "unavailable",
      simulated: mode === "simulator",
      transfer: c.allowTransfer,
      receiver: c.paymentAccount.owner === "CLUB" ? club.name : c.paymentAccount.label,
    },
  };
}

export type CampaignStore = NonNullable<Awaited<ReturnType<typeof getCampaignStore>>>;
