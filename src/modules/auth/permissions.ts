import "server-only";
import { notFound } from "next/navigation";
import type { SessionUser } from "./session";
import { UserError } from "@/shared/errors";

export type Capability =
  | "clubs.manage" // alta/baja de clubes, cuentas de cobro, usuarios
  | "club.profile" // editar identidad, horarios y condiciones del club
  | "catalog.manage"
  | "campaign.manage"
  | "campaign.view"
  | "campaign.request" // armar borrador, precios al socio, alcance y pedir activación (club propio)
  | "agreements.manage" // acuerdos comerciales privados
  | "samples.manage" // muestrario y compras del club
  | "samples.view"
  | "shipments.manage" // envíos consolidados textil → club
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
  | "benefit.settle"
  | "reports.export"; // exportaciones (el club, solo las de su club)

const MATRIX: Record<SessionUser["role"], Capability[]> = {
  TEXTIL_ADMIN: [
    "clubs.manage", "club.profile", "catalog.manage", "campaign.manage", "campaign.view", "campaign.request", "orders.view", "orders.manage",
    "agreements.manage", "samples.manage", "samples.view", "shipments.manage",
    "payments.review", "production.view", "production.advance", "production.plan", "lot.receive",
    "deliveries.register", "deliveries.exception", "benefit.view", "benefit.settle", "reports.export",
  ],
  // Club: solo consulta de su club (campañas, ventas, pedidos, pagos, saldo, resultado, producción, entrega y reportes)
  CLUB_ADMIN: ["campaign.view", "samples.view", "orders.view", "benefit.view", "reports.export"],
  PRODUCTION: ["production.view", "production.advance"],
  DELIVERY: ["campaign.view", "orders.view", "reports.export"],
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

/** Roles de club: solo consulta. Ninguna acción de escritura del panel está permitida para ellos. */
export const READ_ONLY_ROLES: SessionUser["role"][] = ["CLUB_ADMIN", "DELIVERY"];
export const isReadOnly = (user: SessionUser) => READ_ONLY_ROLES.includes(user.role);

/**
 * Corta cualquier escritura de un usuario de consulta (club). Se llama al inicio de cada acción del panel,
 * además de los controles por capacidad, para que la restricción valga aunque se invoque la acción directamente.
 */
export function assertWriter(user: SessionUser) {
  if (isReadOnly(user)) throw new UserError("Tu usuario del club es de consulta: los cambios los registra la empresa.", "read_only");
}

/** Solo la empresa. */
export function assertCompany(user: SessionUser) {
  if (user.role !== "TEXTIL_ADMIN") throw new UserError("Solo la empresa puede hacer este cambio.", "forbidden");
}

/** Filtro Prisma por club según el rol. */
export function clubScope(user: SessionUser): { clubId?: string } {
  if (user.role === "TEXTIL_ADMIN" || user.role === "PRODUCTION") return {};
  return { clubId: user.clubId ?? "__none__" };
}

/** Revisión y registro de pagos: solo la empresa (el club comunica los pagos externos y la empresa los registra). */
export function canReviewPayments(user: SessionUser, _clubId: string, _accountOwner: "TEXTIL" | "CLUB") {
  return user.role === "TEXTIL_ADMIN";
}

export const ROLE_LABELS: Record<SessionUser["role"], string> = {
  TEXTIL_ADMIN: "Empresa",
  CLUB_ADMIN: "Club (consulta)",
  PRODUCTION: "Producción",
  DELIVERY: "Club (consulta de entregas)",
};
