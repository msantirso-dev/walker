import "server-only";
import { notFound } from "next/navigation";
import type { SessionUser } from "./session";

export type Capability =
  | "clubs.manage" // alta/baja de clubes, cuentas de cobro, usuarios
  | "club.profile" // editar identidad, horarios y condiciones del club
  | "catalog.manage"
  | "campaign.manage"
  | "campaign.view"
  | "orders.view"
  | "orders.manage" // cancelar, registrar pagos manuales y devoluciones
  | "payments.review"
  | "production.view"
  | "production.advance" // en producción, control de calidad, listo para despacho
  | "production.plan" // generar y aprobar lotes
  | "lot.receive" // marcar recibido por el club
  | "deliveries.register"
  | "deliveries.exception"
  | "benefit.view"
  | "benefit.settle";

const MATRIX: Record<SessionUser["role"], Capability[]> = {
  TEXTIL_ADMIN: [
    "clubs.manage", "club.profile", "catalog.manage", "campaign.manage", "campaign.view", "orders.view", "orders.manage",
    "payments.review", "production.view", "production.advance", "production.plan", "lot.receive",
    "deliveries.register", "deliveries.exception", "benefit.view", "benefit.settle",
  ],
  CLUB_ADMIN: [
    "club.profile", "campaign.view", "orders.view", "orders.manage", "payments.review", "lot.receive",
    "deliveries.register", "deliveries.exception", "benefit.view",
  ],
  PRODUCTION: ["production.view", "production.advance"],
  DELIVERY: ["deliveries.register"],
};

/** ¿El usuario tiene la capacidad, y (si aplica) sobre ese club? */
export function can(user: SessionUser, cap: Capability, clubId?: string | null): boolean {
  if (!MATRIX[user.role].includes(cap)) return false;
  if (user.role === "TEXTIL_ADMIN" || user.role === "PRODUCTION") return true;
  // Roles de club: solo su club
  if (clubId === undefined) return true; // capacidad general (se filtra por scope en la consulta)
  return Boolean(user.clubId) && user.clubId === clubId;
}

/** Lanza 404 si no puede (no revela la existencia del recurso). */
export function assertCan(user: SessionUser, cap: Capability, clubId?: string | null) {
  if (!can(user, cap, clubId)) notFound();
}

/** Filtro Prisma por club según el rol. */
export function clubScope(user: SessionUser): { clubId?: string } {
  if (user.role === "TEXTIL_ADMIN" || user.role === "PRODUCTION") return {};
  return { clubId: user.clubId ?? "__none__" };
}

/** Revisión de pagos: la textil siempre; el club solo si la cuenta de cobro es del club. */
export function canReviewPayments(user: SessionUser, clubId: string, accountOwner: "TEXTIL" | "CLUB") {
  if (user.role === "TEXTIL_ADMIN") return true;
  return user.role === "CLUB_ADMIN" && user.clubId === clubId && accountOwner === "CLUB";
}

export const ROLE_LABELS: Record<SessionUser["role"], string> = {
  TEXTIL_ADMIN: "Administración textil",
  CLUB_ADMIN: "Administración del club",
  PRODUCTION: "Producción",
  DELIVERY: "Entregas",
};
