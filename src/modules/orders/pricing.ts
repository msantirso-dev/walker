import "server-only";
import { db, type Tx } from "@/shared/db";
import { percentOf } from "@/shared/money";
import type { CartInput } from "./cart-schema";
import { MAX_UNITS_PER_ORDER } from "./cart-schema";

export class OrderError extends Error {
  constructor(message: string, public code = "invalid") {
    super(message);
  }
}

export const PERS_NAME_RE = /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ .'-]*$/;

export async function loadCampaignForSale(campaignId: string, tx: Tx = db) {
  return tx.campaign.findUnique({
    where: { id: campaignId },
    include: {
      club: true,
      paymentAccount: true,
      benefitRule: true,
      products: {
        where: { active: true },
        include: {
          product: {
            include: {
              components: { orderBy: { sort: "asc" }, include: { garment: { include: { sizes: { where: { enabled: true }, orderBy: { sort: "asc" } } } } } },
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
  persName: string | null;
  persNumber: string | null;
  persPrice: number;
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

    let persName: string | null = null;
    let persNumber: string | null = null;
    let persPrice = 0;
    const rawName = item.persName?.trim().toUpperCase();
    const rawNum = item.persNumber?.trim();
    if (rawName) {
      if (!p.persNameEnabled) throw new OrderError(`${p.name} no admite nombre estampado.`);
      if (rawName.length > p.persNameMaxLen) throw new OrderError(`El nombre estampado admite hasta ${p.persNameMaxLen} caracteres.`);
      if (!PERS_NAME_RE.test(rawName)) throw new OrderError("El nombre estampado solo admite letras, espacios, punto, guion y apóstrofo.");
      persName = rawName;
      persPrice += p.persNamePrice;
    }
    if (rawNum) {
      if (!p.persNumberEnabled) throw new OrderError(`${p.name} no admite número.`);
      if (!/^\d{1,3}$/.test(rawNum)) throw new OrderError("El número debe tener solo dígitos.");
      const n = Number(rawNum);
      if (n < p.persNumberMin || n > p.persNumberMax) throw new OrderError(`El número debe estar entre ${p.persNumberMin} y ${p.persNumberMax}.`);
      persNumber = String(n);
      persPrice += p.persNumberPrice;
    }
    if ((persName || persNumber) && item.quantity !== 1) throw new OrderError("Las prendas personalizadas se agregan de a una unidad.");

    for (let i = 0; i < item.quantity; i++) {
      units.push({
        productId: p.id,
        campaignProductId: cp.id,
        productCode: p.code,
        productName: p.name,
        productDesc: p.description,
        unitPrice: cp.price,
        listPrice: cp.listPrice,
        persName,
        persNumber,
        persPrice,
        playerKey: item.playerKey,
        components,
      });
    }
  }
  if (units.length > MAX_UNITS_PER_ORDER) throw new OrderError(`Un pedido admite hasta ${MAX_UNITS_PER_ORDER} prendas.`);

  if (cart.delivery.method === "SHIPPING" && !c.shippingEnabled) throw new OrderError("Esta campaña no ofrece envío.");
  if (cart.delivery.method === "PICKUP" && !c.pickupEnabled) throw new OrderError("Esta campaña no ofrece retiro.");
  if (cart.delivery.method === "SHIPPING" && (cart.delivery.address?.trim().length ?? 0) < 6) throw new OrderError("Completá la dirección de envío.");

  const itemsTotal = units.reduce((a, u) => a + u.unitPrice, 0);
  const persTotal = units.reduce((a, u) => a + u.persPrice, 0);
  const shippingTotal = cart.delivery.method === "SHIPPING" ? c.shippingPrice : 0;
  const total = itemsTotal + persTotal + shippingTotal;
  return { units, itemsTotal, persTotal, shippingTotal, total, depositRequired: depositFor(c, itemsTotal + persTotal, total) };
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
