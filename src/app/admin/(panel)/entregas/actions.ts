"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/db";
import { run, str, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { requireUser, actorOf, clientIp, clubScope, can } from "@/modules/auth";
import { registerDelivery, normalizePickupCode } from "@/modules/deliveries";
import { deliverPending } from "@/modules/notifications";

export async function deliverAction(orderId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    await registerDelivery(u, actorOf(u, await clientIp()), orderId, {
      unitIds: fd.getAll("unit").map(String),
      receivedByName: str(fd, "receivedByName"),
      receivedByNote: str(fd, "receivedByNote") || undefined,
      exceptionReason: str(fd, "exceptionReason") || undefined,
      notes: str(fd, "notes") || undefined,
    });
    void deliverPending().catch(() => {});
    revalidatePath(`/admin/entregas/${orderId}`);
    return "Entrega registrada.";
  });
}

export async function findByCodeAction(_p: FormState, fd: FormData): Promise<FormState> {
  let target = "";
  const res = await run(async () => {
    const u = await requireUser();
    if (!can(u, "deliveries.register")) throw new UserError("Sin permiso.");
    const raw = str(fd, "code");
    const pickup = normalizePickupCode(raw);
    const scope = clubScope(u);
    const o = pickup
      ? await db.order.findFirst({ where: { ...scope, pickupCode: pickup } })
      : await db.order.findFirst({ where: { ...scope, code: raw.toUpperCase() } });
    if (!o) throw new UserError("No encontramos un pedido con ese código en tu club.");
    target = o.id;
  });
  if (target) redirect(`/admin/entregas/${target}`);
  return res;
}
