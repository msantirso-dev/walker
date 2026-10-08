"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/db";
import { run, str, opt, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { parseArLocal } from "@/shared/dates";
import { parsePesos } from "@/shared/money";
import { requireUser, assertCan, can, actorOf, clientIp } from "@/modules/auth";
import { createShipment, dispatchShipment, receiveShipment } from "@/modules/logistics";
import type { CostBearer } from "@/generated/prisma/client";

const day = (v: string) => (v ? parseArLocal(`${v}T12:00`) : null);

export async function createShipmentAction(campaignId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "shipments.manage");
    const bearer = str(fd, "costBearer") as CostBearer;
    await createShipment({ ...actorOf(u, await clientIp()), id: u.id }, campaignId, {
      address: str(fd, "address"), receiverName: str(fd, "receiverName"), receiverPhone: opt(fd, "receiverPhone"), carrier: opt(fd, "carrier"),
      trackingRef: opt(fd, "trackingRef"), cost: str(fd, "cost") ? parsePesos(str(fd, "cost")) : null,
      costBearer: ["PENDING", "TEXTIL", "CLUB"].includes(bearer) ? bearer : "PENDING", notes: opt(fd, "notes"), lotIds: fd.getAll("lotIds").map(String),
    });
    revalidatePath(`/admin/campanas/${campaignId}/logistica`);
    return "Envío creado. Imprimí el remito consolidado para acompañar la mercadería.";
  });
}

export async function dispatchAction(campaignId: string, shipmentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "shipments.manage");
    const at = day(str(fd, "dispatchedAt"));
    if (!at) throw new UserError("Indicá la fecha de despacho.");
    await dispatchShipment(actorOf(u, await clientIp()), shipmentId, { dispatchedAt: at, carrier: opt(fd, "carrier"), trackingRef: opt(fd, "trackingRef") });
    revalidatePath(`/admin/campanas/${campaignId}/logistica`);
    return "Envío despachado.";
  });
}

export async function receiveAction(campaignId: string, shipmentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    const s = await db.clubShipment.findUnique({ where: { id: shipmentId }, select: { clubId: true } });
    if (!s) throw new UserError("Envío inexistente.");
    assertCan(u, "lot.receive", s.clubId);
    const at = day(str(fd, "receivedAt"));
    if (!at) throw new UserError("Indicá la fecha de recepción.");
    await receiveShipment(actorOf(u, await clientIp()), can(u, "shipments.manage") ? null : u.clubId, shipmentId, { receivedAt: at, receivedBy: str(fd, "receivedBy"), notes: opt(fd, "notes") });
    revalidatePath(`/admin/campanas/${campaignId}/logistica`);
    return "Recepción registrada: los pedidos quedan listos para retirar y se avisó a los compradores.";
  });
}
