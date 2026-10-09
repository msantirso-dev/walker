"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/db";
import { run, str, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { parsePesos } from "@/shared/money";
import { requireWriter, assertCan, actorOf, clientIp } from "@/modules/auth";
import { reviewTransfer, registerManualPayment, registerRefund } from "@/modules/payments";
import { cancelOrder, cancelUnit, editUnit, resendOrderLink, type EditReason } from "@/modules/orders";
import { deliverPending } from "@/modules/notifications";
import type { PaymentKind } from "@/generated/prisma/client";

async function ctx(orderId: string, cap: "orders.manage" | "payments.review" | "orders.view" = "orders.manage") {
  const u = await requireWriter();
  const o = await db.order.findUnique({ where: { id: orderId }, select: { clubId: true } });
  if (!o) throw new UserError("Pedido inexistente.");
  assertCan(u, cap, o.clubId);
  return { u, actor: actorOf(u, await clientIp()) };
}

const after = (orderId: string) => {
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin/pagos");
  void deliverPending().catch(() => {});
};

export async function reviewAction(orderId: string, paymentId: string, approve: boolean, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor } = await ctx(orderId, "payments.review");
    if (approve) {
      const raw = str(fd, "amount");
      const amount = raw ? parsePesos(raw) : undefined;
      if (raw && !amount) throw new UserError("Importe acreditado inválido.");
      await reviewTransfer(u, actor, paymentId, { approve: true, amount: amount ?? undefined, note: str(fd, "note") || undefined });
    } else {
      await reviewTransfer(u, actor, paymentId, { approve: false, reason: str(fd, "reason") });
    }
    after(orderId);
    return approve ? "Pago aprobado." : "Comprobante rechazado. Se avisó al comprador con el motivo.";
  });
}

export async function manualPaymentAction(orderId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor } = await ctx(orderId, "payments.review");
    const amount = parsePesos(str(fd, "amount"));
    if (!amount) throw new UserError("Indicá el importe.");
    const method = str(fd, "method") === "TRANSFER" ? "TRANSFER" : "CASH";
    const kind = (["DEPOSIT", "BALANCE", "FULL"].includes(str(fd, "kind")) ? str(fd, "kind") : "BALANCE") as PaymentKind;
    await registerManualPayment(u, actor, orderId, { amount, method, kind, reference: str(fd, "reference") || undefined, note: str(fd, "note") || undefined });
    after(orderId);
    return "Pago registrado.";
  });
}

export async function refundAction(orderId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { u, actor } = await ctx(orderId, "payments.review");
    const amount = parsePesos(str(fd, "amount"));
    if (!amount) throw new UserError("Indicá el importe devuelto.");
    await registerRefund(u, actor, orderId, { amount, reference: str(fd, "reference"), note: str(fd, "note") || undefined });
    after(orderId);
    return "Devolución registrada.";
  });
}

export async function cancelOrderAction(orderId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await ctx(orderId);
    await cancelOrder(actor, orderId, str(fd, "reason"));
    after(orderId);
    return "Pedido cancelado. Si hubo cobros, registrá la devolución cuando se realice.";
  });
}

export async function cancelUnitAction(orderId: string, unitId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await ctx(orderId);
    const unit = await db.orderUnit.findFirst({ where: { id: unitId, orderId } });
    if (!unit) throw new UserError("Unidad inexistente.");
    await cancelUnit(actor, unitId, str(fd, "reason"));
    after(orderId);
    return "Unidad cancelada. Si ya estaba en un lote aprobado, el próximo lote de ajuste la descuenta.";
  });
}

export async function editUnitAction(orderId: string, unitId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await ctx(orderId);
    const unit = await db.orderUnit.findFirst({ where: { id: unitId, orderId }, include: { components: true } });
    if (!unit) throw new UserError("Prenda inexistente.");
    const sizes = Object.fromEntries(unit.components.map((c) => [c.label, str(fd, `size_${c.label}`)]));
    const player = str(fd, "playerId");
    const reason = (["VOLUNTARY", "DATA_ERROR", "TEXTIL_ERROR", "DEFECT"].includes(str(fd, "reason")) ? str(fd, "reason") : "DATA_ERROR") as EditReason;
    const r = await editUnit(actor, unitId, {
      sizes, persName: str(fd, "persName") || null, persNumber: str(fd, "persNumber") || null, playerId: player === "__none" ? null : player || undefined,
      reason, note: str(fd, "note") || undefined,
    });
    after(orderId);
    return r.persPriceChanged ? "Prenda actualizada. Cambió la personalización: se recalculó el total del pedido." : "Prenda actualizada.";
  });
}

export async function resendLinkAction(orderId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await ctx(orderId, "orders.view");
    await resendOrderLink(actor, orderId);
    after(orderId);
    return "Enlace reenviado al correo del comprador.";
  });
}

