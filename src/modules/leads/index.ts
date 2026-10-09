import "server-only";
import { z } from "zod";
import { db } from "@/shared/db";
import { allow } from "@/shared/rate-limit";
import { UserError } from "@/shared/errors";
import { audit, type Actor } from "@/modules/audit";
import type { SessionUser } from "@/modules/auth";
import type { LeadStatus } from "@/generated/prisma/client";

/** Solicitudes de reunión de clubes desde la web comercial. Las atiende la empresa. */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = { NEW: "Nueva", CONTACTED: "Contactado", CLOSED: "Cerrada" };

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);
export const leadInput = z.object({
  name: text(2, 80, "Indicá tu nombre."),
  clubName: text(2, 120, "Indicá el nombre del club."),
  role: z.string().trim().max(80).optional().transform((v) => v || null),
  email: z.string().trim().toLowerCase().pipe(z.email("Correo inválido.")),
  phone: z.string().trim().max(40).optional().transform((v) => v || null),
  city: z.string().trim().max(80).optional().transform((v) => v || null),
  message: z.string().trim().max(1500).optional().transform((v) => v || null),
});

export async function createLead(raw: unknown, ip: string | null) {
  if (!allow(`lead:${ip ?? "local"}`, 5, 60 * 60_000)) throw new UserError("Recibimos varias solicitudes desde esta conexión. Probá de nuevo en una hora.");
  const input = leadInput.parse(raw);
  const lead = await db.lead.create({ data: { ...input, ip } });
  await audit({ role: "PUBLIC", ip }, { entity: "lead", entityId: lead.id, action: "lead.created", data: { clubName: input.clubName } });
  return lead;
}

export async function listLeads(user: SessionUser) {
  if (user.role !== "TEXTIL_ADMIN") return [];
  return db.lead.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
}

export async function updateLead(user: SessionUser, actor: Actor, id: string, status: LeadStatus, notes: string | null) {
  if (user.role !== "TEXTIL_ADMIN") throw new UserError("Solo la empresa gestiona las solicitudes.");
  const prev = await db.lead.findUniqueOrThrow({ where: { id } });
  await db.lead.update({ where: { id }, data: { status, notes, handledAt: status === "NEW" ? null : new Date(), handledById: user.id } });
  await audit(actor, { entity: "lead", entityId: id, action: "lead.updated", before: { status: prev.status, notes: prev.notes }, after: { status, notes } });
}
