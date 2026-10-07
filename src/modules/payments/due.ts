import "server-only";
import type { PaymentKind } from "@/generated/prisma/client";

type OrderAmounts = { status: string; total: number; paidAmount: number; depositRequired: number; inReviewAmount: number };
type CampaignMode = { paymentMode: string; status: string };

/** Qué puede pagar el comprador ahora y por cuánto. */
export function dueOptions(o: OrderAmounts, c: CampaignMode): { kind: PaymentKind; amount: number; label: string }[] {
  if (o.status === "CANCELLED" || c.status === "CANCELLED") return [];
  const balance = o.total - o.paidAmount;
  if (balance <= 0) return [];
  if (o.status === "CONFIRMED") return [{ kind: "BALANCE", amount: balance, label: "Saldo" }];
  const full = { kind: "FULL" as const, amount: balance, label: "Pago total" };
  if (c.paymentMode === "FULL") return [full];
  const dep = Math.max(0, o.depositRequired - o.paidAmount);
  if (dep <= 0) return [full];
  return dep === balance ? [full] : [{ kind: "DEPOSIT", amount: dep, label: "Seña" }, full];
}

export function amountFor(o: OrderAmounts, c: CampaignMode, kind: PaymentKind) {
  return dueOptions(o, c).find((d) => d.kind === kind) ?? null;
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: "Iniciado",
  PENDING: "Pendiente",
  IN_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  EXPIRED: "Vencido",
  REFUNDED: "Devuelto",
};
export const PAYMENT_KIND_LABEL: Record<string, string> = { DEPOSIT: "Seña", BALANCE: "Saldo", FULL: "Pago total", REFUND: "Devolución" };
export const PAYMENT_METHOD_LABEL: Record<string, string> = { TRANSFER: "Transferencia", MERCADOPAGO: "Mercado Pago", CASH: "Efectivo" };
