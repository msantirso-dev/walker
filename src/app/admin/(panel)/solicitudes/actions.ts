"use server";
import { revalidatePath } from "next/cache";
import { run, str, type FormState } from "@/shared/actions";
import { requireWriter, actorOf, clientIp, assertCompany } from "@/modules/auth";
import { updateLead } from "@/modules/leads";
import type { LeadStatus } from "@/generated/prisma/client";

export async function leadAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCompany(u);
    const status = str(fd, "status") as LeadStatus;
    if (!["NEW", "CONTACTED", "CLOSED"].includes(status)) return "Estado inválido.";
    await updateLead(u, actorOf(u, await clientIp()), str(fd, "id"), status, str(fd, "notes") || null);
    revalidatePath("/admin/solicitudes");
    return "Solicitud actualizada.";
  });
}
