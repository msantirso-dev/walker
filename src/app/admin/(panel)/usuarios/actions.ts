"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/db";
import { run, str, opt, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { requireUser, assertCan, actorOf, clientIp, hashPassword } from "@/modules/auth";
import { audit } from "@/modules/audit";

const schema = z.object({
  name: z.string().min(3, "Nombre muy corto").max(80),
  email: z.string().email("Correo inválido").toLowerCase(),
  role: z.enum(["TEXTIL_ADMIN", "CLUB_ADMIN", "PRODUCTION", "DELIVERY"]),
  clubId: z.string().nullable(),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
});

export async function createUser(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "clubs.manage");
    const d = schema.parse({ name: str(fd, "name"), email: str(fd, "email"), role: str(fd, "role"), clubId: opt(fd, "clubId"), password: str(fd, "password") });
    if ((d.role === "CLUB_ADMIN" || d.role === "DELIVERY") && !d.clubId) throw new UserError("Los usuarios de club necesitan un club asignado.");
    if ((d.role === "TEXTIL_ADMIN" || d.role === "PRODUCTION") && d.clubId) throw new UserError("Los usuarios de la textil no se asignan a un club.");
    if (await db.user.findUnique({ where: { email: d.email } })) throw new UserError("Ya existe un usuario con ese correo.");
    const created = await db.user.create({ data: { name: d.name, email: d.email, role: d.role, clubId: d.clubId, passwordHash: await hashPassword(d.password) } });
    await audit(actorOf(u, await clientIp()), { entity: "User", entityId: created.id, clubId: d.clubId, action: "user.created", data: { email: d.email, role: d.role } });
    revalidatePath("/admin/usuarios");
    return "Usuario creado. Compartile la contraseña por un canal privado y pedile que la cambie.";
  });
}

export async function toggleUser(userId: string) {
  const u = await requireUser();
  assertCan(u, "clubs.manage");
  if (userId === u.id) return;
  const t = await db.user.findUnique({ where: { id: userId } });
  if (!t) return;
  await db.user.update({ where: { id: userId }, data: { active: !t.active } });
  if (t.active) await db.session.deleteMany({ where: { userId } });
  await audit(actorOf(u, await clientIp()), { entity: "User", entityId: userId, clubId: t.clubId, action: t.active ? "user.disabled" : "user.enabled" });
  revalidatePath("/admin/usuarios");
}

export async function resetPassword(userId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "clubs.manage");
    const pw = str(fd, "password");
    if (pw.length < 10) throw new UserError("La contraseña debe tener al menos 10 caracteres.");
    await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw) } });
    await db.session.deleteMany({ where: { userId } });
    await audit(actorOf(u, await clientIp()), { entity: "User", entityId: userId, action: "user.password_reset" });
    return "Contraseña actualizada; se cerraron sus sesiones.";
  });
}
