import "server-only";
import { db, type Tx } from "@/shared/db";
import { UserError } from "@/shared/errors";
import { percentOf } from "@/shared/money";
import type { CartInput } from "./cart-schema";
import { MAX_UNITS_PER_ORDER } from "./cart-schema";
import { NAME_RE, OptionError, optionsSummary, resolveOptions, type OptionGroupT, type ResolvedOption } from "@/modules/catalog/options";

export class OrderError extends UserError {}

export const PERS_NAME_RE = NAME_RE;

export const optionGroupsInclude = { orderBy: { sort: "asc" }, include: { values: { orderBy: { sort: "asc" } } } } as const;

export async function loadCampaignForSale(campaignId: string, tx: Tx = db) {
  return tx.campaign.findUnique({
    where: { id: campaignId },
    include: {
      club: true,
      paymentAccount: true,
      benefitRule: true,
      audienceSports: true,
      audienceCategories: { include: { sport: true } },
      products: {
        where: { active: true },
        include: {
          product: {
            include: {
              components: { orderBy: { sort: "asc" }, include: { garment: { include: { sizes: { where: { enabled: true }, orderBy: { sort: "asc" } } } } } },
              optionGroups: optionGroupsInclude,
            },
          },
        },
      },
    },
  });
}

export type SaleCampaign = NonNullable<Awaited<ReturnType<typeof loadCampaignForSale>>>;

export function isWindowOpen(c: { status: string; opensAt: Date; closesAt: Date }, now = new Date()) {
  return c.status === "PUBLISHED" && c.opensAt <= now && now < c.closesAt;
}

export type PricedUnit = {
  productId: string;
  campaignProductId: string;
  productCode: string;
  productName: string;
  productDesc: string | null;
  unitPrice: number;
  listPrice: number | null;
  textilPrice: number | null;
  persName: string | null;
  persNumber: string | null;
  persPrice: number;
  optionsTextil: number;
  optionsClub: number;
  legend: string | null;
  noSizeChange: boolean;
  options: ResolvedOption[];
  playerKey: string | null;
  components: { garmentId: string; garmentCode: string; garmentName: string; variant: string | null; label: string; sizeLabel: string; printTarget: boolean }[];
};

export type Priced = {
  units: PricedUnit[];
  itemsTotal: number;
  persTotal: number;
  shippingTotal: number;
  total: number;
  depositRequired: number;
  advanceRequired: number;
  clubBalanceRequired: number;
};

/** Calcula precios en el servidor a partir del carrito. Ignora cualquier importe del navegador. */
export function priceCart(c: SaleCampaign, cart: Pick<CartInput, "items" | "players" | "delivery">): Priced {
  const playerKeys = new Set(cart.players.map((p) => p.key));
  const units: PricedUnit[] = [];

  for (const item of cart.items) {
    const cp = c.products.find((x) => x.productId === item.productId);
    if (!cp || !cp.product.active) throw new OrderError("Un producto del carrito ya no está disponible. Actualizá la página.");
    const p = cp.product;
    if (item.playerKey && !playerKeys.has(item.playerKey)) throw new OrderError("Hay una prenda asociada a un jugador inexistente.");

    const components = p.components.map((comp) => {
      const size = item.sizes[comp.label];
      if (!size) throw new OrderError(`Elegí el talle de ${comp.label.toLowerCase()} en ${p.name}.`);
      const gs = comp.garment.sizes.find((s) => s.label === size);
      if (!gs) throw new OrderError(`El talle ${size} no está disponible para ${comp.label.toLowerCase()} en ${p.name}.`);
      return {
        garmentId: comp.garmentId,
        garmentCode: comp.garment.code,
        garmentName: comp.garment.name,
        variant: comp.garment.variant,
        label: comp.label,
        sizeLabel: gs.label,
        printTarget: comp.printTarget,
      };
    });
    const extra = Object.keys(item.sizes).filter((k) => !p.components.some((c2) => c2.label === k));
    if (extra.length) throw new OrderError("El carrito tiene componentes que no corresponden al producto.");

    // Opciones del configurador (y compatibilidad con nombre/número directos)
    const raw: Record<string, string | undefined> = { ...(item.options ?? {}) };
    const nameGroup = p.optionGroups.find((g) => g.role === "NAME" && g.type === "TEXT");
    const numberGroup = p.optionGroups.find((g) => g.role === "NUMBER" && g.type === "NUMBER");
    if (item.persName?.trim()) {
      if (!nameGroup) throw new OrderError(`${p.name} no admite nombre estampado.`);
      raw[nameGroup.id] = item.persName;
    }
    if (item.persNumber?.trim()) {
      if (!numberGroup) throw new OrderError(`${p.name} no admite número.`);
      raw[numberGroup.id] = item.persNumber;
    }
    let options: ResolvedOption[];
    try {
      options = resolveOptions(p.optionGroups as unknown as OptionGroupT[], raw, p.name);
    } catch (e) {
      if (e instanceof OptionError) throw new OrderError(e.message);
      throw e;
    }
    const sum = optionsSummary(options);
    if (sum.freeText && item.quantity !== 1) throw new OrderError("Las prendas con nombre o número se agregan de a una unidad.");
    if (c.pricingModel === "TEXTIL_ADVANCE" && cp.textilPrice == null) throw new OrderError(`${p.name} no tiene precio textil cargado. Avisá al club.`);

    // Alcance de la campaña: disciplina o categoría del jugador
    if (c.audience !== "ALL") {
      const pl = cart.players.find((x) => x.key === item.playerKey);
      if (!pl) throw new OrderError(`${p.name}: esta preventa es para ${audienceText(c)}. Elegí el jugador.`);
      if (c.audience === "SPORTS" && !c.audienceSports.some((s2) => s2.name === pl.sport))
        throw new OrderError(`Esta preventa es para ${audienceText(c)}. Revisá la disciplina de ${pl.name}.`);
      if (c.audience === "CATEGORIES" && !c.audienceCategories.some((cat) => cat.name === pl.category && (!cat.sport || cat.sport.name === pl.sport)))
        throw new OrderError(`Esta preventa es para ${audienceText(c)}. Revisá la categoría de ${pl.name}.`);
    }

    for (let i = 0; i < item.quantity; i++) {
      units.push({
        productId: p.id,
        campaignProductId: cp.id,
        productCode: p.code,
        productName: p.name,
        productDesc: p.description,
        unitPrice: cp.price,
        listPrice: cp.listPrice,
        textilPrice: cp.textilPrice,
        persName: sum.name,
        persNumber: sum.number,
        persPrice: sum.textil + sum.club,
        optionsTextil: sum.textil,
        optionsClub: sum.club,
        legend: sum.legend,
        noSizeChange: sum.noSizeChange,
        options,
        playerKey: item.playerKey,
        components,
      });
    }
  }
  if (units.length > MAX_UNITS_PER_ORDER) throw new OrderError(`Un pedido admite hasta ${MAX_UNITS_PER_ORDER} prendas.`);

  if (cart.delivery.method === "SHIPPING" && (c.pricingModel === "TEXTIL_ADVANCE" || !c.shippingEnabled)) throw new OrderError("Esta campaña no ofrece envío: la producción se entrega al club.");
  if (cart.delivery.method === "PICKUP" && !c.pickupEnabled) throw new OrderError("Esta campaña no ofrece retiro.");
  if (cart.delivery.method === "SHIPPING" && (cart.delivery.address?.trim().length ?? 0) < 6) throw new OrderError("Completá la dirección de envío.");

  const itemsTotal = units.reduce((a, u) => a + u.unitPrice, 0);
  const persTotal = units.reduce((a, u) => a + u.persPrice, 0);
  const shippingTotal = cart.delivery.method === "SHIPPING" ? c.shippingPrice : 0;
  const total = itemsTotal + persTotal + shippingTotal;
  if (c.pricingModel === "TEXTIL_ADVANCE") {
    // Anticipo = precio textil + parte textil de los adicionales; el resto es saldo del club
    const advanceRequired = units.reduce((a, u) => a + (u.textilPrice ?? 0) + u.optionsTextil, 0);
    return { units, itemsTotal, persTotal, shippingTotal, total, depositRequired: advanceRequired, advanceRequired, clubBalanceRequired: total - advanceRequired };
  }
  const dep = depositFor(c, itemsTotal + persTotal, total);
  return { units, itemsTotal, persTotal, shippingTotal, total, depositRequired: dep, advanceRequired: 0, clubBalanceRequired: 0 };
}

export function audienceText(c: { audience: string; audienceSports: { name: string }[]; audienceCategories: { name: string; sport?: { name: string } | null }[] }) {
  if (c.audience === "SPORTS") return c.audienceSports.map((s) => s.name).join(", ");
  if (c.audience === "CATEGORIES") return c.audienceCategories.map((x) => (x.sport ? `${x.sport.name} ${x.name}` : x.name)).join(", ");
  return "todo el club";
}

/** Precio al socio a partir del precio textil y un recargo en centésimas de % (3000 = 30 %). */
export function priceWithMarkup(textilPrice: number, markupBp: number) {
  return Math.round(textilPrice + (textilPrice * markupBp) / 10000);
}

/** Seña requerida: sobre prendas + personalización; el envío se cobra con el saldo. */
export function depositFor(c: { paymentMode: string; depositType: string; depositValue: number }, goods: number, total: number) {
  if (c.paymentMode === "FULL") return total;
  if (c.depositType === "FIXED") return Math.min(c.depositValue, total);
  return Math.min(total, Math.round((goods * c.depositValue) / 100));
}

export function benefitFor(rule: { type: string; value: number } | null | undefined, unitPrice: number) {
  if (!rule) return 0;
  return rule.type === "FIXED_PER_UNIT" ? rule.value : percentOf(unitPrice, rule.value);
}
