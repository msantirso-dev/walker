"use server";
import { revalidatePath } from "next/cache";
import { run, str, type FormState } from "@/shared/actions";
import { parseArLocal } from "@/shared/dates";
import { parsePesos } from "@/shared/money";
import { requireWriter, actorOf, clientIp } from "@/modules/auth";
import { saveSheet } from "@/modules/clubsheet";
import type { ClubSheetStatus } from "@/generated/prisma/client";

const day = (v: string) => (v ? parseArLocal(`${v}T12:00`) : null);

/** Fila de la planilla del club: no modifica el pedido. */
export async function saveSheetAction(orderId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    const st = str(fd, "status") as ClubSheetStatus;
    await saveSheet(u, actorOf(u, await clientIp()), orderId, {
      status: (["PENDING", "BALANCE_PAID", "DELIVERED", "CANCELLED", "OTHER"].includes(st) ? st : "PENDING") as ClubSheetStatus,
      balancePaid: str(fd, "balancePaid") ? (parsePesos(str(fd, "balancePaid")) ?? -1) : 0,
      paidAt: day(str(fd, "paidAt")), method: str(fd, "method") || null, reference: str(fd, "reference") || null,
      deliveredAt: day(str(fd, "deliveredAt")), deliveredTo: str(fd, "deliveredTo") || null, notes: str(fd, "notes") || null,
    });
    revalidatePath("/admin/planilla");
    revalidatePath(`/admin/pedidos/${orderId}`);
    return "Planilla actualizada. Es un registro del club: no cambia el pedido.";
  });
}
