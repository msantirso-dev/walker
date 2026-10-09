"use server";
import { revalidatePath } from "next/cache";
import { run, str, int, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { requireWriter, actorOf, clientIp, assertCompany } from "@/modules/auth";
import { addPurchaseToProduction, createAdditionalPurchase, registerPurchasePayment } from "@/modules/purchases";
import { approvePurchase } from "@/modules/samples";
import type { AdditionalReason } from "@/generated/prisma/client";

const pesosToCents = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new UserError("Revisá los importes.");
  return Math.round(n * 100);
};
const dateAr = (v: string) => (v ? new Date(`${v}T12:00:00-03:00`) : null);

export async function createAdditionalAction(campaignId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCompany(u);
    const reasons = fd.getAll("reasons").map(String).filter((r): r is AdditionalReason => ["LATE_SALES", "BOUTIQUE", "SIZE_CHANGES", "OTHER"].includes(r));
    const items = [];
    for (let i = 0; i < 8; i++) {
      const productId = str(fd, `p${i}`);
      const qty = int(fd, `q${i}`);
      if (!productId || qty <= 0) continue;
      items.push({ productId, sizeLabel: str(fd, `s${i}`), quantity: qty, unitPrice: pesosToCents(str(fd, `u${i}`) || "0") });
    }
    await createAdditionalPurchase(u, actorOf(u, await clientIp()), campaignId, { reasons, items, dueAt: dateAr(str(fd, "dueAt")), notes: str(fd, "notes") });
    revalidatePath(`/admin/campanas/${campaignId}/compras`);
    return "Compra adicional registrada. Aprobala y sumala a producción con una revisión del lote.";
  });
}

export async function purchasePaymentAction(campaignId: string, purchaseId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    await registerPurchasePayment(u, actorOf(u, await clientIp()), purchaseId, {
      amount: pesosToCents(str(fd, "amount")), paidAt: dateAr(str(fd, "paidAt")) ?? new Date(), method: str(fd, "method"), reference: str(fd, "reference"),
    });
    revalidatePath(`/admin/campanas/${campaignId}/compras`);
    return "Pago registrado.";
  });
}

export async function purchaseStepAction(campaignId: string, purchaseId: string, step: "approve" | "production", _p: FormState): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCompany(u);
    const actor = { ...actorOf(u, await clientIp()), id: u.id, role: u.role };
    if (step === "approve") await approvePurchase(actor, purchaseId);
    else await addPurchaseToProduction(u, actor, purchaseId);
    revalidatePath(`/admin/campanas/${campaignId}/compras`);
    return step === "approve" ? "Compra aprobada." : "Revisión creada: aprobá el lote de ajuste en Producción.";
  });
}
