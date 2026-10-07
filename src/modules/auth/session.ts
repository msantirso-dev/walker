import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { db } from "@/shared/db";
import { randomToken, sha256 } from "@/shared/crypto";
import { isProd } from "@/shared/env";
import { audit } from "@/modules/audit";
import type { Role } from "@/generated/prisma/client";

const COOKIE = "camada_session";
const TTL_HOURS = 12;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  clubId: string | null;
};

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

let DUMMY_HASH: string | undefined;

// Límite simple de intentos de ingreso por IP + correo (memoria del proceso).
const attempts = new Map<string, { n: number; until: number }>();
function tooMany(key: string) {
  const a = attempts.get(key);
  return a ? a.n >= 5 && a.until > Date.now() : false;
}
function fail(key: string) {
  const a = attempts.get(key);
  const until = Date.now() + 15 * 60_000;
  attempts.set(key, { n: a && a.until > Date.now() ? a.n + 1 : 1, until });
}

export async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await clientIp();
  const key = `${ip}|${email.toLowerCase()}`;
  if (tooMany(key)) return { ok: false, error: "Demasiados intentos. Esperá 15 minutos y volvé a probar." };

  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  const ok = user?.active ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) {
    fail(key);
    // Hash ficticio para igualar tiempos cuando el usuario no existe
    if (!user) await bcrypt.compare(password, (DUMMY_HASH ??= bcrypt.hashSync("camada-dummy", 10)));
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }
  attempts.delete(key);

  const token = randomToken();
  await db.session.create({
    data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000), ip },
  });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ id: user.id, role: user.role, clubId: user.clubId, ip }, { entity: "User", entityId: user.id, action: "auth.login" });

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: TTL_HOURS * 3600,
  });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE);
}

/** Usuario de la sesión actual (memoizado por request). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  const { id, email, name, role, clubId } = s.user;
  return { id, email, name, role, clubId };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/admin/ingresar");
  return u;
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}
