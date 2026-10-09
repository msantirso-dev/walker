import "server-only";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { audit, SYSTEM, type Actor } from "@/modules/audit";
import { OrderError } from "@/modules/orders/pricing";
import type { AgreementStatus } from "@/generated/prisma/client";
import { getBrand } from "@/modules/brand";

/**
 * Acuerdo comercial privado textil–club (exclusividad, marca "by", muestrario, compras iniciales, reglas de precio).
 * Es información interna: nunca se muestra en la tienda ni al comprador. No hay firma electrónica: se adjunta el contrato.
 */

export const AGREEMENT_STATUS_LABEL: Record<AgreementStatus, string> = { DRAFT: "Borrador", ACTIVE: "Vigente", EXPIRED: "Vencido", TERMINATED: "Rescindido" };
/** Exclusividad sugerida: 12 meses (supuesto provisional, editable por acuerdo). */
export const DEFAULT_EXCLUSIVITY_MONTHS = 12;

export type AgreementInput = {
  status: AgreementStatus; startsAt: Date; endsAt: Date; exclusive: boolean; brandLine?: string | null;
  samplesCommitted?: string | null; catalogAgreed?: string | null; activationConditions?: string | null; initialPurchases?: string | null;
  pricingRules?: string | null; notes?: string | null; alertDaysBefore: number;
};

function validate(i: AgreementInput) {
  if (i.endsAt <= i.startsAt) throw new OrderError("La fecha de fin debe ser posterior al inicio.");
  if (!Number.isInteger(i.alertDaysBefore) || i.alertDaysBefore < 1 || i.alertDaysBefore > 365) throw new OrderError("El aviso de vencimiento debe estar entre 1 y 365 días.");
}

/** Línea de marca por defecto: "<Club> by <marca de la empresa>". */
export const defaultBrandLine = (clubName: string, brandName: string) => `${clubName} by ${brandName}`;

export async function saveAgreement(actor: Actor & { id: string }, clubId: string, id: string | null, i: AgreementInput, contract?: { key: string; name: string }) {
  validate(i);
  const club = await db.club.findUniqueOrThrow({ where: { id: clubId } });
  if (i.status === "ACTIVE" && i.exclusive) {
    const overlapping = await db.clubAgreement.findFirst({
      where: { clubId, status: "ACTIVE", exclusive: true, id: id ? { not: id } : undefined, startsAt: { lt: i.endsAt }, endsAt: { gt: i.startsAt } },
    });
    if (overlapping) throw new OrderError("Ya hay un acuerdo exclusivo vigente que se superpone con esas fechas.");
  }
  const data = {
    ...i,
    brandLine: i.brandLine?.trim() || defaultBrandLine(club.shortName ?? club.name, (await getBrand()).name),
    ...(contract ? { contractFileKey: contract.key, contractFileName: contract.name.slice(0, 120) } : {}),
  };
  const a = id
    ? await db.clubAgreement.update({ where: { id, clubId }, data: { ...data, lastAlertAt: null } })
    : await db.clubAgreement.create({ data: { ...data, clubId, createdById: actor.id } });
  await audit(actor, { entity: "ClubAgreement", entityId: a.id, clubId, action: id ? "agreement.updated" : "agreement.created", data: { status: i.status, endsAt: i.endsAt.toISOString(), contract: Boolean(contract) } });
  return a;
}

const DAY = 86400_000;

/** Acuerdos vigentes que vencen dentro de su ventana de aviso (para el tablero y el aviso por correo). */
export async function expiringAgreements(now = new Date()) {
  const list = await db.clubAgreement.findMany({ where: { status: "ACTIVE" }, include: { club: { select: { id: true, name: true } } }, orderBy: { endsAt: "asc" } });
  return list
    .map((a) => ({ ...a, daysLeft: Math.ceil((a.endsAt.getTime() - now.getTime()) / DAY) }))
    .filter((a) => a.daysLeft <= a.alertDaysBefore);
}

/**
 * Tarea programada: marca vencidos y avisa a la textil una vez por acuerdo dentro de la ventana de aviso.
 * Devuelve la cantidad de avisos generados.
 */
export async function runAgreementAlerts(now = new Date()) {
  const expired = await db.clubAgreement.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } } });
  for (const a of expired) {
    await db.clubAgreement.update({ where: { id: a.id }, data: { status: "EXPIRED" } });
    await audit(SYSTEM, { entity: "ClubAgreement", entityId: a.id, clubId: a.clubId, action: "agreement.expired" });
  }
  const due = (await expiringAgreements(now)).filter((a) => !a.lastAlertAt);
  const admins = await db.user.findMany({ where: { role: "TEXTIL_ADMIN", active: true }, select: { email: true } });
  for (const a of due) {
    for (const u of admins) {
      await db.emailOutbox.create({
        data: {
          template: "AGREEMENT_EXPIRING", to: u.email,
          subject: `Acuerdo con ${a.club.name}: vence en ${a.daysLeft} días`,
          body: `El acuerdo comercial con ${a.club.name} vence el ${a.endsAt.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.\nRevisalo en el panel: ${env().APP_URL}/admin/clubes/${a.clubId}/acuerdo`,
        },
      });
    }
    await db.clubAgreement.update({ where: { id: a.id }, data: { lastAlertAt: now } });
    await audit(SYSTEM, { entity: "ClubAgreement", entityId: a.id, clubId: a.clubId, action: "agreement.alert", data: { daysLeft: a.daysLeft } });
  }
  return due.length;
}
