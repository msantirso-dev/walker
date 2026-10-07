import "server-only";
import { db } from "@/shared/db";
import { heldUnits } from "@/modules/orders/capacity";
import { isWindowOpen } from "@/modules/orders/pricing";
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

export async function getClubStore(slug: string) {
  const club = await db.club.findUnique({
    where: { slug },
    include: {
      sports: { include: { sport: true } },
      photos: { orderBy: { sort: "asc" } },
      campaigns: { where: { status: { not: "DRAFT" } }, orderBy: { opensAt: "desc" }, select: { id: true, slug: true, title: true, season: true, status: true, opensAt: true, closesAt: true, description: true, showCatalogWhenClosed: true, deliveryDaysMin: true, deliveryDaysMax: true, paymentMode: true, depositType: true, depositValue: true, faq: true } },
    },
  });
  if (!club || !club.active) return null;
  const now = new Date();
  const current = club.campaigns.find((c) => c.status === "PUBLISHED" && c.closesAt > now) ?? null;
  return { club, current, history: club.campaigns.filter((c) => c.id !== current?.id) };
}

export type StoreSize = { label: string; group: string; a: number | null; b: number | null };
export type StoreComponent = { label: string; garmentCode: string; garmentName: string; variant: string | null; material: string | null; care: string | null; measureA: string; measureB: string; unit: string; note: string | null; printTarget: boolean; sizes: StoreSize[] };
export type StoreProduct = {
  id: string; code: string; name: string; kind: string; description: string | null; audience: string | null; sport: string | null; manufacturingTerms: string | null;
  price: number; listPrice: number | null; remaining: number | null;
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
      products: {
        where: { active: true, product: { active: true } },
        orderBy: { sort: "asc" },
        include: {
          product: {
            include: {
              sport: true,
              images: { orderBy: { sort: "asc" } },
              components: { orderBy: { sort: "asc" }, include: { garment: { include: { sizes: { where: { enabled: true }, orderBy: { sort: "asc" } } } } } },
            },
          },
        },
      },
    },
  });
  if (!c || c.status === "DRAFT") return null;

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
    payments: {
      mercadopago: c.allowMercadoPago && mode !== "unavailable",
      simulated: mode === "simulator",
      transfer: c.allowTransfer,
      receiver: c.paymentAccount.owner === "CLUB" ? club.name : c.paymentAccount.label,
    },
  };
}

export type CampaignStore = NonNullable<Awaited<ReturnType<typeof getCampaignStore>>>;
