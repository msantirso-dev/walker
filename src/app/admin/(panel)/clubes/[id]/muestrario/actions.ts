"use server";
import { revalidatePath } from "next/cache";
import { run, str, opt, int, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { parseArLocal } from "@/shared/dates";
import { parsePesos } from "@/shared/money";
import { requireUser, assertCan, actorOf, clientIp } from "@/modules/auth";
import { saveSampleSet, setProductSampleLink, savePurchase, approvePurchase } from "@/modules/samples";
import type { PurchasePurpose, SampleAvailability, SampleKind } from "@/generated/prisma/client";

async function manager() {
  const u = await requireUser();
  assertCan(u, "samples.manage");
  return { u, actor: { ...actorOf(u, await clientIp()), id: u.id, role: u.role } };
}

/** "S:2, M:3, L:3" o una línea por talle "S 2" → [{ sizeLabel, quantity }] */
function parseSizes(raw: string) {
  return raw
    .split(/[,\n;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^([A-Za-z0-9]{1,6})\s*[:=x×\s]\s*(\d{1,4})$/) ?? x.match(/^([A-Za-z0-9]{1,6})$/);
      if (!m) throw new UserError(`Talle mal escrito: "${x}". Formato: S:2, M:3`);
      return { sizeLabel: m[1], quantity: m[2] ? Number(m[2]) : 1 };
    });
}

export async function saveSampleSetAction(clubId: string, setId: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await manager();
    await saveSampleSet(actor, clubId, setId, {
      kind: (["TOP", "BOTTOM", "OTHER"].includes(str(fd, "kind")) ? str(fd, "kind") : "TOP") as SampleKind,
      name: str(fd, "name"), referenceGarmentId: opt(fd, "referenceGarmentId"), deliveredAt: parseArLocal(str(fd, "deliveredAt") ? `${str(fd, "deliveredAt")}T12:00` : ""),
      availability: (["PENDING_DELIVERY", "AVAILABLE", "NOT_AVAILABLE"].includes(str(fd, "availability")) ? str(fd, "availability") : "PENDING_DELIVERY") as SampleAvailability,
      location: opt(fd, "location"), notes: opt(fd, "notes"), purchaseId: opt(fd, "purchaseId"), items: parseSizes(str(fd, "sizes")),
    });
    revalidatePath(`/admin/clubes/${clubId}/muestrario`);
    return "Curva guardada.";
  });
}

export async function linkAction(clubId: string, productId: string, setId: string, approved: boolean, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await manager();
    await setProductSampleLink(actor, productId, setId, approved, str(fd, "notes") || undefined);
    revalidatePath(`/admin/clubes/${clubId}/muestrario`);
    return approved ? "Equivalencia aprobada: la tienda muestra el aviso de muestrario." : "Equivalencia retirada.";
  });
}

export async function savePurchaseAction(clubId: string, purchaseId: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await manager();
    const purposes = fd.getAll("purposes").map(String).filter((x) => ["SAMPLE", "INITIAL", "BACKUP"].includes(x)) as PurchasePurpose[];
    const sizes = str(fd, "sizes");
    await savePurchase(actor, clubId, purchaseId, {
      productId: opt(fd, "productId"), campaignId: opt(fd, "campaignId"), purposes, committedQty: int(fd, "committedQty", 0), paidQty: int(fd, "paidQty", 0),
      paidAmount: str(fd, "paidAmount") ? parsePesos(str(fd, "paidAmount")) : null, items: sizes ? parseSizes(sizes) : [], notes: opt(fd, "notes"),
    });
    revalidatePath(`/admin/clubes/${clubId}/muestrario`);
    return "Compra guardada. Si cambió, necesita aprobarse de nuevo.";
  });
}

export async function approvePurchaseAction(clubId: string, purchaseId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await manager();
    await approvePurchase(actor, purchaseId);
    revalidatePath(`/admin/clubes/${clubId}/muestrario`);
    return "Compra aprobada.";
  });
}
