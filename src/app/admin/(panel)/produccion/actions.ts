"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/db";
import { run, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { requireWriter, assertCan, can, actorOf, clientIp } from "@/modules/auth";
import { approveLot, advanceLot, generateLot } from "@/modules/production";
import { deliverPending } from "@/modules/notifications";
import type { LotStatus } from "@/generated/prisma/client";

export async function approveLotAction(lotId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCan(u, "production.plan");
    await approveLot({ ...actorOf(u, await clientIp()), id: u.id }, lotId);
    revalidatePath(`/admin/produccion/${lotId}`);
    return "Lote aprobado y congelado. Los cambios posteriores irán en un lote de ajuste.";
  });
}

export async function regenerateLotAction(lotId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCan(u, "production.plan");
    const lot = await db.productionLot.findUniqueOrThrow({ where: { id: lotId } });
    if (lot.status !== "PENDING_APPROVAL") throw new UserError("Solo se recalcula un lote pendiente de aprobación.");
    await generateLot({ ...actorOf(u, await clientIp()), id: u.id }, lot.campaignId);
    revalidatePath(`/admin/produccion/${lotId}`);
    return "Lote recalculado con los pedidos actuales.";
  });
}

export async function advanceLotAction(lotId: string, to: LotStatus, _p: FormState, _fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    const lot = await db.productionLot.findUniqueOrThrow({ where: { id: lotId }, include: { campaign: true } });
    const ok = to === "RECEIVED_BY_CLUB" ? can(u, "lot.receive", lot.campaign.clubId) : can(u, "production.advance");
    if (!ok) throw new UserError("No tenés permiso para este cambio de estado.");
    await advanceLot(actorOf(u, await clientIp()), lotId, to);
    void deliverPending().catch(() => {});
    revalidatePath(`/admin/produccion/${lotId}`);
    return to === "RECEIVED_BY_CLUB" ? "Recepción registrada. Los pedidos quedan listos para retirar y se avisó a los compradores." : "Estado actualizado.";
  });
}
