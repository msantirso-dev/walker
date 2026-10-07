import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { randomToken, sha256 } from "@/shared/crypto";
import { UserError } from "@/shared/errors";
import { audit } from "@/modules/audit";
import { queuePasswordReset, deliverPending } from "@/modules/notifications";

export const RESET_MINUTES = 30;
export const MIN_PASSWORD = 10;

function assertStrong(pw: string, email: string) {
  if (pw.length < MIN_PASSWORD) throw new UserError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  if (pw.length > 200) throw new UserError("La contraseña es demasiado larga.");
  if (pw.toLowerCase().includes(email.split("@")[0].toLowerCase())) throw new UserError("La contraseña no puede contener tu usuario de correo.");
  if (/^(.)\1+$/.test(pw)) throw new UserError("Elegí una contraseña menos predecible.");
}

/** Cambio de contraseña por el propio usuario. Cierra sus otras sesiones. */
export async function changeOwnPassword(userId: string, currentSessionHash: string | null, input: { current: string; next: string; confirm: string }) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(input.current, u.passwordHash))) throw new UserError("La contraseña actual no es correcta.");
  if (input.next !== input.confirm) throw new UserError("La confirmación no coincide con la contraseña nueva.");
  if (input.next === input.current) throw new UserError("La contraseña nueva debe ser distinta de la actual.");
  assertStrong(input.next, u.email);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(input.next, 10) } });
  await db.session.deleteMany({ where: { userId, ...(currentSessionHash ? { tokenHash: { not: currentSessionHash } } : {}) } });
  await db.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await audit({ id: userId, role: u.role, clubId: u.clubId }, { entity: "User", entityId: userId, action: "user.password_changed" });
}

/**
 * Pide un enlace para restablecer la contraseña. La respuesta al usuario es siempre la misma,
 * exista o no la cuenta. Limita a una solicitud cada 2 minutos por usuario.
 */
export async function requestPasswordReset(email: string, ip: string | null) {
  const u = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!u || !u.active) return;
  const recent = await db.passwordReset.count({ where: { userId: u.id, createdAt: { gt: new Date(Date.now() - 2 * 60_000) } } });
  if (recent) return;
  await db.passwordReset.updateMany({ where: { userId: u.id, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken();
  await db.passwordReset.create({ data: { userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000), ip } });
  await queuePasswordReset(u, `${env().APP_URL}/admin/restablecer/${token}`, RESET_MINUTES);
  await audit({ role: "SYSTEM", ip }, { entity: "User", entityId: u.id, clubId: u.clubId, action: "user.password_reset_requested" });
  await deliverPending();
}

export async function findValidReset(token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const r = await db.passwordReset.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!r || r.usedAt || r.expiresAt < new Date() || !r.user.active) return null;
  return r;
}

/** Usa el token (una sola vez), fija la contraseña nueva y cierra todas las sesiones. */
export async function resetPassword(token: string, next: string, confirm: string, ip: string | null) {
  const r = await findValidReset(token);
  if (!r) throw new UserError("El enlace venció o ya fue usado. Pedí uno nuevo.");
  if (next !== confirm) throw new UserError("La confirmación no coincide con la contraseña nueva.");
  assertStrong(next, r.user.email);
  const hash = await bcrypt.hash(next, 10);
  await db.$transaction(async (tx) => {
    const used = await tx.passwordReset.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new UserError("El enlace ya fue usado.");
    await tx.user.update({ where: { id: r.userId }, data: { passwordHash: hash } });
    await tx.session.deleteMany({ where: { userId: r.userId } });
  });
  await audit({ id: r.userId, role: r.user.role, clubId: r.user.clubId, ip }, { entity: "User", entityId: r.userId, action: "user.password_reset" });
}
