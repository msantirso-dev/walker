import "server-only";
import { db, type Tx } from "@/shared/db";

/**
 * Unidades que ocupan cupo: pedidos confirmados, pedidos con reserva vigente
 * y pedidos con un comprobante en revisión.
 */
function holdingWhere(campaignId: string, now: Date, excludeOrderId?: string) {
  return {
    status: "ACTIVE" as const,
    order: {
      campaignId,
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      OR: [
        { status: "CONFIRMED" as const },
        { status: "PENDING_PAYMENT" as const, reservedUntil: { gt: now } },
        { status: "PENDING_PAYMENT" as const, inReviewAmount: { gt: 0 } },
      ],
    },
  };
}

export async function heldUnits(campaignId: string, tx: Tx = db, excludeOrderId?: string) {
  const now = new Date();
  // Secuencial: dentro de una transacción comparten conexión
  const total = await tx.orderUnit.count({ where: holdingWhere(campaignId, now, excludeOrderId) });
  const byProduct = await tx.orderUnit.groupBy({ by: ["productId"], where: holdingWhere(campaignId, now, excludeOrderId), _count: { _all: true } });
  return { total, byProduct: new Map(byProduct.map((r) => [r.productId, r._count._all])) };
}

/** Bloquea la fila de la campaña: serializa altas y reactivaciones que consumen cupo. */
export async function lockCampaign(tx: Tx, campaignId: string) {
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
}

/** Verifica que las unidades pedidas entren en el cupo. Llamar con la campaña bloqueada. */
export async function assertCapacity(
  tx: Tx,
  campaign: { id: string; maxUnits: number | null; products: { productId: string; maxUnits: number | null; product: { name: string } }[] },
  wanted: { productId: string }[],
  excludeOrderId?: string,
): Promise<string | null> {
  const limited = campaign.maxUnits != null || campaign.products.some((p) => p.maxUnits != null);
  if (!limited) return null;
  const held = await heldUnits(campaign.id, tx, excludeOrderId);
  if (campaign.maxUnits != null && held.total + wanted.length > campaign.maxUnits) {
    const left = Math.max(0, campaign.maxUnits - held.total);
    return left === 0 ? "Se completó el cupo de esta preventa." : `Quedan ${left} prendas disponibles en el cupo de esta preventa.`;
  }
  const count = new Map<string, number>();
  for (const w of wanted) count.set(w.productId, (count.get(w.productId) ?? 0) + 1);
  for (const [productId, n] of count) {
    const cp = campaign.products.find((p) => p.productId === productId);
    if (cp?.maxUnits != null && (held.byProduct.get(productId) ?? 0) + n > cp.maxUnits) {
      const left = Math.max(0, cp.maxUnits - (held.byProduct.get(productId) ?? 0));
      return left === 0 ? `Se completó el cupo de ${cp.product.name}.` : `De ${cp.product.name} quedan ${left} unidades disponibles.`;
    }
  }
  return null;
}
