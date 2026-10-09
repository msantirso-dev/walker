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
    // Online solo se cobra el anticipo de la empresa; el saldo del club se registra aparte
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
  CREATED: "Pendiente de confirmación",
  PENDING: "Pendiente de confirmación",
  IN_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  EXPIRED: "Vencido",
  REFUNDED: "Devuelto",
};
export const PAYMENT_KIND_LABEL: Record<string, string> = { DEPOSIT: "Seña", BALANCE: "Saldo", FULL: "Pago total", REFUND: "Devolución", ADVANCE: "Anticipo", CLUB_BALANCE: "Saldo al club" };
export const PAYMENT_METHOD_LABEL: Record<string, string> = { TRANSFER: "Transferencia", MERCADOPAGO: "Mercado Pago", CASH: "Efectivo", OTHER: "Otro medio" };
export const RECEIVER_LABEL: Record<string, string> = { TEXTIL: "Empresa", CLUB: "Club" };

/**
 * Estado de cobro para el modelo de anticipo textil. El sistema sigue el anticipo; el saldo lo cobra y registra
 * el club en su propia planilla, por eso nunca se muestra "pagado" mientras haya saldo para el club.
 */
export function advanceStates(o: { advanceRequired: number; advancePaid: number; clubBalanceRequired: number; status: string }) {
  const advanceOk = o.advancePaid >= o.advanceRequired && o.advanceRequired > 0;
  return {
    advance: advanceOk ? "Anticipo aprobado" : "Anticipo pendiente",
    club: o.clubBalanceRequired === 0 ? "Sin saldo al club" : "Saldo a pagar al club",
    advanceOk,
    clubDue: o.clubBalanceRequired,
    fullyPaid: advanceOk && o.clubBalanceRequired === 0,
  };
}
