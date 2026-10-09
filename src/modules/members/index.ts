import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/shared/db";
import { env, isProd } from "@/shared/env";
import { randomToken, sha256 } from "@/shared/crypto";
import { UserError } from "@/shared/errors";
import { allow } from "@/shared/rate-limit";
import { audit } from "@/modules/audit";
import { deliverPending, queuePasswordReset } from "@/modules/notifications";

/**
 * Socios: compradores con cuenta. Pueden explorar y armar el carrito sin sesión, pero inician sesión
 * antes de pagar. La asociación a un club (MemberClub) no equivale a membresía validada.
 */
export const MEMBER_COOKIE = "back_socio";
const TTL_DAYS = 30;
export const MEMBER_MIN_PASSWORD = 8;

export type SessionMember = { id: string; email: string; name: string; phone: string | null };

async function ipNow() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export const registerInput = z.object({
  name: z.string().trim().min(3, "Indicá tu nombre y apellido.").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Correo inválido.")),
  phone: z.string().trim().min(6, "Indicá un teléfono de contacto.").max(40),
  password: z.string().min(MEMBER_MIN_PASSWORD, `La contraseña debe tener al menos ${MEMBER_MIN_PASSWORD} caracteres.`).max(200),
});

async function startSession(memberId: string, ip: string | null) {
  const token = randomToken();
  await db.memberSession.create({ data: { tokenHash: sha256(token), memberId, expiresAt: new Date(Date.now() + TTL_DAYS * 86400_000), ip } });
  await db.member.update({ where: { id: memberId }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(MEMBER_COOKIE, token, { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: TTL_DAYS * 86400 });
}

export async function registerMember(raw: unknown) {
  const ip = await ipNow();
  if (!allow(`member-reg:${ip ?? "local"}`, 10, 60 * 60_000)) throw new UserError("Demasiados registros desde esta conexión. Probá más tarde.");
  const i = registerInput.parse(raw);
  if (await db.member.findUnique({ where: { email: i.email } })) throw new UserError("Ya hay una cuenta con ese correo. Ingresá con tu contraseña.");
  const m = await db.member.create({ data: { name: i.name, email: i.email, phone: i.phone, passwordHash: await bcrypt.hash(i.password, 10) } });
  await audit({ id: m.id, role: "MEMBER", ip }, { entity: "Member", entityId: m.id, action: "member.registered" });
  await startSession(m.id, ip);
  return m;
}

let DUMMY: string | undefined;
export async function loginMember(email: string, password: string) {
  const ip = await ipNow();
  const key = `member-login:${ip ?? "local"}:${email.toLowerCase()}`;
  if (!allow(key, 8, 15 * 60_000)) throw new UserError("Demasiados intentos. Esperá 15 minutos y volvé a probar.");
  const m = await db.member.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = m ? await bcrypt.compare(password, m.passwordHash) : await bcrypt.compare(password, (DUMMY ??= bcrypt.hashSync("back-dummy", 10))).then(() => false);
  if (!m || !ok) throw new UserError("Correo o contraseña incorrectos.");
  await startSession(m.id, ip);
  await audit({ id: m.id, role: "MEMBER", ip }, { entity: "Member", entityId: m.id, action: "member.login" });
  return m;
}

export async function logoutMember() {
  const jar = await cookies();
  const t = jar.get(MEMBER_COOKIE)?.value;
  if (t) await db.memberSession.deleteMany({ where: { tokenHash: sha256(t) } });
  jar.delete(MEMBER_COOKIE);
}

async function memberFromToken(token: string | undefined | null): Promise<SessionMember | null> {
  if (!token) return null;
  const s = await db.memberSession.findUnique({ where: { tokenHash: sha256(token) }, include: { member: true } });
  if (!s || s.expiresAt < new Date()) return null;
  const { id, email, name, phone } = s.member;
  return { id, email, name, phone };
}

/** Socio de la sesión actual (memoizado por request). */
export const currentMember = cache(async () => memberFromToken((await cookies()).get(MEMBER_COOKIE)?.value));

/** Para rutas de API: lee la cookie de la solicitud. */
export async function memberFromRequest(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  const token = raw.split(/;\s*/).find((c) => c.startsWith(`${MEMBER_COOKIE}=`))?.slice(MEMBER_COOKIE.length + 1);
  return memberFromToken(token ? decodeURIComponent(token) : null);
}

/**
 * Asocia al socio con el club de la tienda. El número de socio solo se pide si el club lo configura;
 * guardarlo no valida la membresía (eso lo registra la empresa).
 */
export async function ensureClubLink(memberId: string, clubId: string, memberNumber: string | null | undefined, mode: string) {
  const num = memberNumber?.trim().slice(0, 30) || null;
  const link = await db.memberClub.findUnique({ where: { memberId_clubId: { memberId, clubId } } });
  if (mode === "REQUIRED" && !num && !link?.memberNumber) throw new UserError("Este club pide tu número de socio para comprar.");
  // Dos envíos simultáneos del mismo socio: upsert evita la carrera sobre la asociación
  if (!link)
    return db.memberClub
      .create({ data: { memberId, clubId, memberNumber: mode === "HIDDEN" ? null : num } })
      .catch(() => db.memberClub.findUniqueOrThrow({ where: { memberId_clubId: { memberId, clubId } } }));
  if (num && mode !== "HIDDEN" && num !== link.memberNumber) return db.memberClub.update({ where: { id: link.id }, data: { memberNumber: num, validatedAt: null, validatedById: null } });
  return link;
}

/** Pedidos del socio (solo los suyos). */
export async function memberOrders(memberId: string) {
  return db.order.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, code: true, createdAt: true, status: true, total: true, advanceRequired: true, clubBalanceRequired: true, pricingModel: true, accessTokenEnc: true,
      club: { select: { name: true, slug: true } },
      campaign: { select: { title: true, closesAt: true, deliveryDaysMin: true, deliveryDaysMax: true } },
      _count: { select: { units: true } },
    },
  });
}

export async function requestMemberReset(email: string) {
  const ip = await ipNow();
  if (!allow(`member-reset:${ip ?? "local"}`, 5, 15 * 60_000)) return;
  const m = await db.member.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!m) return;
  const recent = await db.memberPasswordReset.count({ where: { memberId: m.id, createdAt: { gt: new Date(Date.now() - 2 * 60_000) } } });
  if (recent) return;
  await db.memberPasswordReset.updateMany({ where: { memberId: m.id, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken();
  await db.memberPasswordReset.create({ data: { memberId: m.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  await queuePasswordReset(m, `${env().APP_URL}/socios/restablecer/${token}`, 30, "Restablecer tu contraseña");
  await deliverPending().catch(() => {});
}

export async function resetMemberPassword(token: string, password: string, confirm: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) throw new UserError("El enlace no es válido.");
  const r = await db.memberPasswordReset.findUnique({ where: { tokenHash: sha256(token) } });
  if (!r || r.usedAt || r.expiresAt < new Date()) throw new UserError("El enlace venció o ya fue usado. Pedí uno nuevo.");
  if (password !== confirm) throw new UserError("La confirmación no coincide.");
  if (password.length < MEMBER_MIN_PASSWORD) throw new UserError(`La contraseña debe tener al menos ${MEMBER_MIN_PASSWORD} caracteres.`);
  await db.$transaction([
    db.member.update({ where: { id: r.memberId }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
    db.memberPasswordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
    db.memberSession.deleteMany({ where: { memberId: r.memberId } }),
  ]);
  await audit({ id: r.memberId, role: "MEMBER" }, { entity: "Member", entityId: r.memberId, action: "member.password_reset" });
}

/** Solo permite volver a rutas internas (evita redirecciones abiertas). */
export function safeNext(next: string | null | undefined, fallback = "/mi-cuenta") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
