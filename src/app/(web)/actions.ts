"use server";
import { headers } from "next/headers";
import { run, str, type FormState } from "@/shared/actions";
import { createLead } from "@/modules/leads";

export async function requestMeeting(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    // Campo trampa para bots: las personas no lo ven
    if (str(fd, "website")) return "Recibimos tu solicitud.";
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    await createLead(
      { name: str(fd, "name"), clubName: str(fd, "clubName"), role: str(fd, "role"), email: str(fd, "email"), phone: str(fd, "phone"), city: str(fd, "city"), message: str(fd, "message") },
      ip,
    );
    return "Recibimos tu solicitud. Te escribimos para coordinar la reunión.";
  });
}
