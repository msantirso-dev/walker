import "server-only";
import { db } from "@/shared/db";
import { audit, BUYER, type Actor } from "@/modules/audit";
import { canReviewPayments, type SessionUser } from "@/modules/auth";
import { lockOrder, recomputeOrder, renewReservation, notifyConfirmedPayment } from "@/modules/orders/recompute";
import { OrderError } from "@/modules/orders/pricing";
import { queueEmail, orderMailSelect } from "@/modules/notifications";
import { saveReceipt } from "@/modules/storage";
import { amountFor } from "./due";
import type { PaymentKind } from "@/generated/prisma/client";

const MAX_TRANSFERS_PER_ORDER = 12;

/** El comprador sube un comprobante. Queda EN REVISIÓN: no confirma el pago por sí solo. */
export async function submitTransfer(orderId: string, input: { kind: PaymentKind; operationRef: string; file: Buffer; fileName?: string }) {
  const ref = input.operationRef.trim();
  if (ref.length < 3 || ref.length > 60) throw new OrderError("Ingresá el número de operación de la transferencia (3 a 60 caracteres).");
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { campaign: { include: { paymentAccount: true } } } });
  if (!order.campaign.allowTransfer) throw new OrderError("Esta campaña no acepta transferencias.");
  const advance = order.pricingModel === "TEXTIL_ADVANCE";
  const count = await db.payment.count({ where: { orderId, method: "TRANSFER" } });
  if (count >= MAX_TRANSFERS_PER_ORDER) throw new OrderError("Alcanzaste el máximo de comprobantes para este pedido. Escribí al club.");

  const stored = await saveReceipt(input.file, orderId);
  return db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (fresh.inReviewAmount > 0) throw new OrderError("Ya hay un comprobante en revisión. Esperá la respuesta del club.");
    const due = amountFor(fresh, order.campaign, advance ? "ADVANCE" : fresh.status === "CONFIRMED" ? "BALANCE" : input.kind);
    if (!due) throw new OrderError("No hay importes pendientes para ese tipo de pago.");
    if (fresh.status !== "CONFIRMED") await renewReservation(tx, orderId, "TRANSFER", BUYER);
    const rejected = await tx.payment.findFirst({ where: { orderId, method: "TRANSFER", status: "REJECTED" }, orderBy: { createdAt: "desc" } });
    const p = await tx.payment.create({
      data: {
        orderId, kind: due.kind, method: "TRANSFER", amount: due.amount, status: "IN_REVIEW", operationRef: ref,
        receiver: advance ? "TEXTIL" : order.campaign.paymentAccount.owner,
        replacesPaymentId: rejected?.id ?? null,
        receipts: { create: { fileKey: stored.key, mime: stored.mime, size: stored.size, originalName: input.fileName?.slice(0, 120) } },
      },
    });
    await audit(BUYER, { entity: "Order", entityId: orderId, clubId: order.clubId, action: "payment.receipt_submitted", data: { paymentId: p.id, amount: due.amount, operationRef: ref, replaces: rejected?.id ?? null } }, tx);
    await recomputeOrder(tx, orderId, BUYER);
    return p;
  });
}

/** Aprobación o rechazo (con motivo) de un comprobante, por un usuario autorizado. */
export async function reviewTransfer(
  user: SessionUser,
  actor: Actor,
  paymentId: string,
  decision: { approve: true; amount?: number; note?: string } | { approve: false; reason: string },
) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { campaign: { include: { paymentAccount: true } } } } } });
  if (!p || p.method !== "TRANSFER") throw new OrderError("Pago inexistente.");
  if (!canReviewPayments(user, p.order.clubId, p.order.campaign.paymentAccount.owner)) throw new OrderError("No tenés permiso para revisar pagos de esta campaña.");
  if (!decision.approve && decision.reason.trim().length < 5) throw new OrderError("Escribí el motivo del rechazo para informarlo al comprador.");

  await db.$transaction(async (tx) => {
    await lockOrder(tx, p.orderId);
    const cur = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (cur.status !== "IN_REVIEW") throw new OrderError("Este comprobante ya fue revisado.");
    if (decision.approve) {
      const amount = decision.amount ?? cur.amount;
      if (!Number.isInteger(amount) || amount <= 0) throw new OrderError("El importe acreditado no es válido.");
      await tx.payment.update({ where: { id: paymentId }, data: { status: "APPROVED", amount, reviewedById: user.id, reviewedAt: new Date(), reviewNote: decision.note || null } });
      await audit(actor, { entity: "Order", entityId: p.orderId, clubId: p.order.clubId, action: "payment.approved", data: { paymentId, amount, declared: cur.amount } }, tx);
      await recomputeOrder(tx, p.orderId, actor);
      await notifyConfirmedPayment(tx, p.orderId, amount);
    } else {
      await tx.payment.update({ where: { id: paymentId }, data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: decision.reason.trim() } });
      await audit(actor, { entity: "Order", entityId: p.orderId, clubId: p.order.clubId, action: "payment.rejected", data: { paymentId, reason: decision.reason.trim() } }, tx);
      await recomputeOrder(tx, p.orderId, actor);
      // El pedido se conserva: se extiende la reserva para que pueda reemplazar el comprobante.
      const o = await tx.order.findUniqueOrThrow({ where: { id: p.orderId } });
      if (o.status === "PENDING_PAYMENT") {
        await tx.order.update({ where: { id: o.id }, data: { reservedUntil: new Date(Date.now() + p.order.campaign.transferHoldHours * 3600_000) } });
      }
      await queueEmail("RECEIPT_REJECTED", await tx.order.findUniqueOrThrow({ where: { id: p.orderId }, select: orderMailSelect }), { reason: decision.reason.trim() }, tx);
    }
  });
}

/** Pago registrado por un administrador (efectivo en sede o transferencia verificada fuera del sistema). */
export async function registerManualPayment(
  user: SessionUser,
  actor: Actor,
  orderId: string,
  input: { amount: number; method: "CASH" | "TRANSFER"; kind: PaymentKind; reference?: string; note?: string },
) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { campaign: { include: { paymentAccount: true } } } });
  if (!canReviewPayments(user, order.clubId, order.campaign.paymentAccount.owner)) throw new OrderError("No tenés permiso para registrar pagos de esta campaña.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new OrderError("Importe inválido.");
  if (input.kind === "REFUND") throw new OrderError("Usá el registro de devoluciones.");
  if (input.amount > order.total - order.paidAmount) throw new OrderError("El importe supera el saldo del pedido.");
  await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const p = await tx.payment.create({
      data: {
        orderId, kind: input.kind, method: input.method, amount: input.amount, status: "APPROVED", operationRef: input.reference || null,
        receiver: order.pricingModel === "TEXTIL_ADVANCE" ? "TEXTIL" : order.campaign.paymentAccount.owner,
        reviewNote: input.note || null, reviewedById: user.id, reviewedAt: new Date(), createdById: user.id,
      },
    });
    await audit(actor, { entity: "Order", entityId: orderId, clubId: order.clubId, action: "payment.manual", data: { paymentId: p.id, amount: input.amount, method: input.method } }, tx);
    await recomputeOrder(tx, orderId, actor);
    await notifyConfirmedPayment(tx, orderId, input.amount);
  });
}

/** Registra una devolución ya realizada fuera del sistema. No mueve dinero. */
export async function registerRefund(user: SessionUser, actor: Actor, orderId: string, input: { amount: number; reference: string; note?: string; receiver?: "TEXTIL" | "CLUB" }) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { campaign: { include: { paymentAccount: true } } } });
  if (!canReviewPayments(user, order.clubId, order.campaign.paymentAccount.owner)) throw new OrderError("No tenés permiso para registrar devoluciones de esta campaña.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new OrderError("Importe inválido.");
  if (input.amount > order.paidAmount) throw new OrderError("La devolución supera lo cobrado.");
  if (input.reference.trim().length < 3) throw new OrderError("Indicá la referencia de la devolución (operación, comprobante).");
  await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const p = await tx.payment.create({
      data: { orderId, kind: "REFUND", method: "TRANSFER", amount: input.amount, status: "APPROVED", receiver: input.receiver ?? (order.pricingModel === "TEXTIL_ADVANCE" ? "TEXTIL" : order.campaign.paymentAccount.owner), operationRef: input.reference.trim(), reviewNote: input.note || null, reviewedById: user.id, reviewedAt: new Date(), createdById: user.id },
    });
    await audit(actor, { entity: "Order", entityId: orderId, clubId: order.clubId, action: "payment.refund", data: { paymentId: p.id, amount: input.amount, reference: input.reference } }, tx);
    await recomputeOrder(tx, orderId, actor);
  });
}


/**
 * Saldo cobrado por el club (modelo de anticipo textil). Lo registra el club o la textil,
 * con fecha, medio y referencia. No pasa por Mercado Pago ni por la cuenta de la textil.
 */
export async function registerClubBalance(
  user: SessionUser,
  actor: Actor,
  orderId: string,
  input: { amount: number; method: "CASH" | "TRANSFER" | "OTHER"; paidAt: Date; reference: string; note?: string },
) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const allowed = user.role === "TEXTIL_ADMIN" || (user.role === "CLUB_ADMIN" && user.clubId === order.clubId);
  if (!allowed) throw new OrderError("No tenés permiso para registrar el saldo de este club.");
  if (order.pricingModel !== "TEXTIL_ADVANCE") throw new OrderError("Este pedido usa el modelo de seña anterior: registrá el pago desde \"Registrar pago manual\".");
  if (order.status === "CANCELLED") throw new OrderError("El pedido está cancelado.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new OrderError("Importe inválido.");
  const due = order.clubBalanceRequired - order.clubPaid;
  if (input.amount > due) throw new OrderError(due <= 0 ? "El saldo del club ya está cobrado." : "El importe supera el saldo pendiente con el club.");
  if (input.reference.trim().length < 2) throw new OrderError("Indicá una referencia (recibo, operación o nota).");
  if (input.paidAt > new Date(Date.now() + 86400_000)) throw new OrderError("La fecha del cobro no puede ser futura.");
  await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const p = await tx.payment.create({
      data: {
        orderId, kind: "CLUB_BALANCE", method: input.method, receiver: "CLUB", amount: input.amount, status: "APPROVED", paidAt: input.paidAt,
        operationRef: input.reference.trim(), reviewNote: input.note || null, reviewedById: user.id, reviewedAt: new Date(), createdById: user.id,
      },
    });
    await audit(actor, { entity: "Order", entityId: orderId, clubId: order.clubId, action: "payment.club_balance", data: { paymentId: p.id, amount: input.amount, method: input.method, paidAt: input.paidAt.toISOString(), reference: input.reference.trim() } }, tx);
    await recomputeOrder(tx, orderId, actor);
  });
}
