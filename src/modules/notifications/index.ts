import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db, type Tx } from "@/shared/db";
import { env, emailConfigured } from "@/shared/env";
import { decryptSecret } from "@/shared/crypto";
import { ars } from "@/shared/money";

export type Template =
  | "ORDER_RECEIVED"
  | "PAYMENT_CONFIRMED"
  | "RECEIPT_REJECTED"
  | "IN_PRODUCTION"
  | "BALANCE_REQUESTED"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "ORDER_CANCELLED";

export const TEMPLATE_LABELS: Record<Template, string> = {
  ORDER_RECEIVED: "Pedido recibido",
  PAYMENT_CONFIRMED: "Pago confirmado",
  RECEIPT_REJECTED: "Comprobante rechazado",
  IN_PRODUCTION: "Pedido en producción",
  BALANCE_REQUESTED: "Saldo solicitado",
  READY_FOR_PICKUP: "Listo para retirar",
  DELIVERED: "Entrega registrada",
  ORDER_CANCELLED: "Pedido cancelado",
};

export const SYSTEM_TEMPLATE_LABELS: Record<string, string> = {
  ORDER_LINKS: "Reenvío de enlaces de pedido",
  PASSWORD_RESET: "Restablecer contraseña",
};

type OrderForMail = {
  id: string;
  code: string;
  buyerName: string;
  buyerEmail: string;
  accessTokenEnc: string;
  total: number;
  paidAmount: number;
  club: { name: string; pickupAddress: string | null; pickupHours: string | null; whatsapp: string | null };
  campaign: { title: string; pickupInstructions: string | null };
};

export function orderLink(accessTokenEnc: string) {
  return `${env().APP_URL}/pedido/${decryptSecret(accessTokenEnc)}`;
}

function compose(t: Template, o: OrderForMail, extra: { amount?: number; reason?: string; units?: number } = {}) {
  const link = orderLink(o.accessTokenEnc);
  const balance = Math.max(0, o.total - o.paidAmount);
  const hi = `Hola ${o.buyerName.split(" ")[0]}:`;
  const foot = `\n\nSeguí tu pedido ${o.code} en este enlace privado (no lo compartas):\n${link}\n\n${o.club.name} · ${o.campaign.title}`;
  const pickup = [o.club.pickupAddress && `Dirección: ${o.club.pickupAddress}`, o.club.pickupHours && `Horarios: ${o.club.pickupHours}`, o.campaign.pickupInstructions]
    .filter(Boolean)
    .join("\n");
  const map: Record<Template, [string, string]> = {
    ORDER_RECEIVED: [
      `Recibimos tu pedido ${o.code}`,
      `${hi}\n\nRegistramos tu pedido de ${o.campaign.title} por ${ars(o.total)}. Para confirmarlo, pagá la seña desde el enlace. Hasta que el pago se acredite, el pedido no está confirmado.`,
    ],
    PAYMENT_CONFIRMED: [
      `Pago confirmado · pedido ${o.code}`,
      `${hi}\n\nConfirmamos un pago de ${ars(extra.amount ?? 0)}. Total pagado: ${ars(o.paidAmount)}. Saldo: ${ars(balance)}.`,
    ],
    RECEIPT_REJECTED: [
      `Revisá tu comprobante · pedido ${o.code}`,
      `${hi}\n\nNo pudimos aprobar el comprobante que cargaste.\nMotivo: ${extra.reason ?? "sin detalle"}.\n\nPodés subir uno nuevo desde el enlace. Tu pedido se mantiene.`,
    ],
    IN_PRODUCTION: [
      `Tu pedido ${o.code} está en producción`,
      `${hi}\n\nLa fábrica comenzó a producir las prendas de tu pedido. Te avisamos cuando lleguen al club.`,
    ],
    BALANCE_REQUESTED: [
      `Saldo a pagar · pedido ${o.code}`,
      `${hi}\n\nTus prendas están listas. Para retirarlas, completá el saldo de ${ars(balance)} desde el enlace.`,
    ],
    READY_FOR_PICKUP: [
      `Tu pedido ${o.code} está listo para retirar`,
      `${hi}\n\nYa podés retirar tu pedido en el club.\n${pickup}\n\nPresentá el código QR de retiro que figura en el enlace.${balance > 0 ? `\nAntes de retirar, completá el saldo de ${ars(balance)}.` : ""}`,
    ],
    DELIVERED: [
      `Entrega registrada · pedido ${o.code}`,
      `${hi}\n\nRegistramos la entrega de ${extra.units ?? ""} prenda(s) de tu pedido.`,
    ],
    ORDER_CANCELLED: [
      `Pedido ${o.code} cancelado`,
      `${hi}\n\nTu pedido fue cancelado.${extra.reason ? `\nMotivo: ${extra.reason}.` : ""} Si pagaste algún importe, el club o la fábrica se van a comunicar con vos para coordinar la devolución.`,
    ],
  };
  const [subject, body] = map[t];
  return { subject, body: body + foot };
}

/** Encola un correo (dentro de la transacción si se pasa). Se envía con deliverPending(). */
export async function queueEmail(t: Template, o: OrderForMail, extra?: { amount?: number; reason?: string; units?: number }, tx?: Tx) {
  const { subject, body } = compose(t, o, extra);
  await (tx ?? db).emailOutbox.create({ data: { orderId: o.id, to: o.buyerEmail, template: t, subject, body } });
}

export const orderMailSelect = {
  id: true, code: true, buyerName: true, buyerEmail: true, accessTokenEnc: true, total: true, paidAmount: true,
  club: { select: { name: true, pickupAddress: true, pickupHours: true, whatsapp: true } },
  campaign: { select: { title: true, pickupInstructions: true } },
} as const;

/** Reenvía al correo registrado los enlaces privados de sus pedidos (solo a esa dirección). */
export async function queueOrderLinks(
  email: string,
  orders: { id: string; code: string; buyerName: string; accessTokenEnc: string; createdAt: Date; club: { name: string }; campaign: { title: string } }[],
) {
  if (!orders.length) return;
  const name = orders[0].buyerName.split(" ")[0];
  const lines = orders.map((o) => `• ${o.club.name} · ${o.campaign.title} · pedido ${o.code}\n  ${orderLink(o.accessTokenEnc)}`).join("\n\n");
  await db.emailOutbox.create({
    data: {
      to: email,
      template: "ORDER_LINKS",
      subject: orders.length === 1 ? `Tu enlace del pedido ${orders[0].code}` : `Tus enlaces de ${orders.length} pedidos`,
      body: `Hola ${name}:\n\nPediste que te reenviemos los enlaces privados de tus pedidos. Cada enlace sirve para ver el estado, pagar y retirar. No los compartas.\n\n${lines}\n\nSi no lo pediste vos, ignorá este correo: nadie más puede ver estos enlaces.`,
    },
  });
}

export async function queuePasswordReset(user: { email: string; name: string }, link: string, minutes: number) {
  await db.emailOutbox.create({
    data: {
      to: user.email,
      template: "PASSWORD_RESET",
      subject: "Restablecer tu contraseña del panel",
      body: `Hola ${user.name.split(" ")[0]}:\n\nPara elegir una contraseña nueva, entrá a este enlace (vence en ${minutes} minutos y se usa una sola vez):\n${link}\n\nSi no lo pediste vos, ignorá este correo: tu contraseña actual sigue funcionando.`,
    },
  });
}

let transport: Transporter | null = null;

/** Envía los correos pendientes. Sin SMTP, los marca como no enviados (nunca como enviados). */
export async function deliverPending(limit = 50) {
  const pending = await db.emailOutbox.findMany({ where: { status: "QUEUED" }, take: limit, orderBy: { createdAt: "asc" } });
  if (!pending.length) return;
  if (!emailConfigured()) {
    await db.emailOutbox.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: "NOT_SENT_NO_PROVIDER" } });
    return;
  }
  transport ??= nodemailer.createTransport(env().SMTP_URL!);
  for (const m of pending) {
    try {
      await transport.sendMail({ from: env().MAIL_FROM, to: m.to, subject: m.subject, text: m.body });
      await db.emailOutbox.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date() } });
    } catch (e) {
      await db.emailOutbox.update({ where: { id: m.id }, data: { status: "FAILED", error: String((e as Error).message).slice(0, 500) } });
    }
  }
}
