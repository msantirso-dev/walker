import "server-only";
import type { PaymentKind } from "@/generated/prisma/client";

type OrderAmounts = {
  status: string; total: number; paidAmount: number; depositRequired: number; inReviewAmount: number;
  pricingModel?: string; advanceRequired?: number; advancePaid?: number;
};
type CampaignMode = { paymentMode: string; status: string };

/** Qué puede pagar el comprador ahora y por cuánto. */
export function dueOptions(o: OrderAmounts, c: CampaignMode): { kind: PaymentKind; amount: number; label: string }[] {
  if (o.status === "CANCELLED" || c.status === "CANCELLED") return [];
  if (o.pricingModel === "TEXTIL_ADVANCE") {
    // Online solo se cobra el anticipo de la textil; el saldo del club se registra aparte
    const adv = (o.advanceRequired ?? 0) - (o.advancePaid ?? 0);
    return adv > 0 && o.status !== "CONFIRMED" ? [{ kind: "ADVANCE", amount: adv, label: "Anticipo" }] : [];
  }
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
export const PAYMENT_KIND_LABEL: Record<string, string> = { DEPOSIT: "Seña", BALANCE: "Saldo", FULL: "Pago total", REFUND: "Devolución", ADVANCE: "Anticipo textil", CLUB_BALANCE: "Saldo al club" };
export const PAYMENT_METHOD_LABEL: Record<string, string> = { TRANSFER: "Transferencia", MERCADOPAGO: "Mercado Pago", CASH: "Efectivo", OTHER: "Otro medio" };
export const RECEIVER_LABEL: Record<string, string> = { TEXTIL: "Textil", CLUB: "Club" };

/** Estado de cobro en palabras para el modelo de anticipo textil. Nunca "pagado" con saldo del club pendiente. */
export function advanceStates(o: { advanceRequired: number; advancePaid: number; clubBalanceRequired: number; clubPaid: number; status: string }) {
  const advanceOk = o.advancePaid >= o.advanceRequired && o.advanceRequired > 0;
  const clubDue = Math.max(0, o.clubBalanceRequired - o.clubPaid);
  return {
    advance: advanceOk ? "Anticipo aprobado" : "Anticipo pendiente",
    club: o.clubBalanceRequired === 0 ? "Sin saldo al club" : clubDue > 0 ? "Saldo al club pendiente" : "Saldo al club cobrado",
    advanceOk,
    clubDue,
    fullyPaid: advanceOk && clubDue === 0,
  };
}
