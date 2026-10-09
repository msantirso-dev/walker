import "server-only";
import { db } from "@/shared/db";
import { audit, BUYER, type Actor } from "@/modules/audit";
import { queueOrderLinks, deliverPending } from "@/modules/notifications";

const LINK_SELECT = { id: true, code: true, buyerName: true, accessTokenEnc: true, createdAt: true, clubId: true, club: { select: { name: true } }, campaign: { select: { title: true } } } as const;

/**
 * Reenvía al correo registrado los enlaces privados de sus pedidos.
 * Nunca revela si el correo tiene pedidos: el llamador muestra siempre el mismo mensaje.
 * Una solicitud cada 5 minutos por dirección.
 */
export async function requestOrderLinks(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const recent = await db.emailOutbox.count({ where: { to: email, template: "ORDER_LINKS", createdAt: { gt: new Date(Date.now() - 5 * 60_000) } } });
  if (recent) return;
  const orders = await db.order.findMany({
    where: {
      buyerEmail: email,
      createdAt: { gt: new Date(Date.now() - 540 * 86400_000) },
      OR: [{ status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } }, { paidAmount: { gt: 0 } }, { inReviewAmount: { gt: 0 } }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: LINK_SELECT,
  });
  if (!orders.length) return;
  await queueOrderLinks(email, orders);
  for (const o of orders) await audit(BUYER, { entity: "Order", entityId: o.id, clubId: o.clubId, action: "order.links_resent" });
  await deliverPending();
}

/** Reenvío pedido por el club o la empresa para un pedido puntual (al correo del comprador). */
export async function resendOrderLink(actor: Actor, orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { ...LINK_SELECT, buyerEmail: true } });
  await queueOrderLinks(o.buyerEmail, [o]);
  await audit(actor, { entity: "Order", entityId: o.id, clubId: o.clubId, action: "order.links_resent" });
  await deliverPending();
}
