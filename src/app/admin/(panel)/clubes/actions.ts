"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/db";
import { run, str, opt, bool, fileBuf, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { isHex } from "@/shared/colors";
import { SLUG_RE, slugify } from "@/shared/slug";
import { requireWriter, assertCan, actorOf, clientIp } from "@/modules/auth";
import { audit, diffFields } from "@/modules/audit";
import { saveImage } from "@/modules/storage";

const profile = z.object({
  name: z.string().min(3, "El nombre es obligatorio").max(100),
  shortName: z.string().max(22).nullable(),
  description: z.string().max(600).nullable(),
  colorPrimary: z.string().refine(isHex, "Color principal inválido (#RRGGBB)"),
  colorSecondary: z.string().refine(isHex, "Color secundario inválido (#RRGGBB)"),
  city: z.string().max(80).nullable(),
  province: z.string().max(80).nullable(),
  venue: z.string().max(120).nullable(),
  pickupAddress: z.string().max(200).nullable(),
  pickupHours: z.string().max(200).nullable(),
  officeHours: z.string().max(200).nullable(),
  conditions: z.string().max(1500).nullable(),
  whatsapp: z.string().regex(/^\+?[\d\s-]{8,20}$/, "WhatsApp: solo números con código de país y área").nullable(),
  email: z.string().email("Correo inválido").nullable(),
  instagram: z.string().max(60).nullable(),
  facebook: z.string().max(120).nullable(),
  website: z.string().url("Sitio web inválido (https://…)").nullable(),
});

function readProfile(fd: FormData) {
  return profile.parse({
    name: str(fd, "name"), shortName: opt(fd, "shortName"), description: opt(fd, "description"),
    colorPrimary: str(fd, "colorPrimary").toUpperCase(), colorSecondary: str(fd, "colorSecondary").toUpperCase(),
    city: opt(fd, "city"), province: opt(fd, "province"), venue: opt(fd, "venue"), pickupAddress: opt(fd, "pickupAddress"),
    pickupHours: opt(fd, "pickupHours"), officeHours: opt(fd, "officeHours"), conditions: opt(fd, "conditions"),
    whatsapp: opt(fd, "whatsapp")?.replace(/[\s-]/g, "") ?? null, email: opt(fd, "email"), instagram: opt(fd, "instagram")?.replace(/^@/, "") ?? null,
    facebook: opt(fd, "facebook"), website: opt(fd, "website"),
  });
}

export async function createClub(_p: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  const res = await run(async () => {
    const u = await requireWriter();
    assertCan(u, "clubs.manage");
    const data = readProfile(fd);
    const slug = str(fd, "slug") || slugify(data.name);
    if (!SLUG_RE.test(slug)) throw new UserError("La URL solo admite minúsculas, números y guiones.");
    if (await db.club.findUnique({ where: { slug } })) throw new UserError("Ya existe un club con esa URL.");
    const club = await db.club.create({ data: { ...data, slug } });
    await audit(actorOf(u, await clientIp()), { entity: "Club", entityId: club.id, clubId: club.id, action: "club.created", data: { slug } });
    id = club.id;
  });
  if (id) redirect(`/admin/clubes/${id}`);
  return res;
}

export async function updateClub(clubId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCan(u, "club.profile", clubId);
    const data = readProfile(fd);
    const extra: Record<string, unknown> = {};
    if (u.role === "TEXTIL_ADMIN") {
      const slug = str(fd, "slug");
      if (slug) {
        if (!SLUG_RE.test(slug)) throw new UserError("La URL solo admite minúsculas, números y guiones.");
        const other = await db.club.findUnique({ where: { slug } });
        if (other && other.id !== clubId) throw new UserError("Ya existe un club con esa URL.");
        extra.slug = slug;
      }
      extra.active = bool(fd, "active");
    }
    const logo = await fileBuf(fd, "logo");
    if (logo) extra.logoUrl = await saveImage(logo, `club-${clubId}`);
    const cover = await fileBuf(fd, "cover");
    if (cover) extra.coverUrl = await saveImage(cover, `club-${clubId}`);
    await db.club.update({ where: { id: clubId }, data: { ...data, ...extra } });
    await audit(actorOf(u, await clientIp()), { entity: "Club", entityId: clubId, clubId, action: "club.updated", data: { fields: Object.keys({ ...data, ...extra }) } });
    revalidatePath(`/admin/clubes/${clubId}`);
  });
}

export async function setSports(clubId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCan(u, "clubs.manage");
    const ids = fd.getAll("sport").map(String);
    const newSport = str(fd, "newSport");
    if (newSport) {
      const s = await db.sport.upsert({ where: { name: newSport }, create: { name: newSport }, update: {} });
      ids.push(s.id);
    }
    await db.$transaction([db.clubSport.deleteMany({ where: { clubId } }), db.clubSport.createMany({ data: [...new Set(ids)].map((sportId) => ({ clubId, sportId })) })]);
    revalidatePath(`/admin/clubes/${clubId}`);
  });
}

export async function addCategory(clubId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCan(u, "club.profile", clubId);
    const name = str(fd, "name");
    if (name.length < 2 || name.length > 40) throw new UserError("Nombre de categoría inválido.");
    const sportId = opt(fd, "sportId");
    const exists = await db.category.findFirst({ where: { clubId, sportId, name } });
    if (exists) throw new UserError("Esa categoría ya existe.");
    const max = await db.category.aggregate({ where: { clubId }, _max: { sort: true } });
    await db.category.create({ data: { clubId, sportId, name, sort: (max._max.sort ?? 0) + 1 } });
    revalidatePath(`/admin/clubes/${clubId}`);
    return "Categoría agregada.";
  });
}

export async function toggleCategory(clubId: string, categoryId: string) {
  const u = await requireWriter();
  assertCan(u, "club.profile", clubId);
  const c = await db.category.findFirst({ where: { id: categoryId, clubId } });
  if (c) await db.category.update({ where: { id: c.id }, data: { active: !c.active } });
  revalidatePath(`/admin/clubes/${clubId}`);
}

export async function addPhoto(clubId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCan(u, "club.profile", clubId);
    const f = await fileBuf(fd, "photo");
    if (!f) throw new UserError("Elegí una imagen.");
    const count = await db.clubPhoto.count({ where: { clubId } });
    if (count >= 12) throw new UserError("Máximo 12 fotos por club.");
    await db.clubPhoto.create({ data: { clubId, url: await saveImage(f, `club-${clubId}`), caption: opt(fd, "caption"), sort: count } });
    revalidatePath(`/admin/clubes/${clubId}`);
    return "Foto agregada.";
  });
}

export async function removePhoto(clubId: string, photoId: string) {
  const u = await requireWriter();
  assertCan(u, "club.profile", clubId);
  await db.clubPhoto.deleteMany({ where: { id: photoId, clubId } });
  revalidatePath(`/admin/clubes/${clubId}`);
}

/** Servicio adicional: planilla de gestión propia del club (no afecta los datos del sistema). */
export async function setManagementPanel(clubId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCan(u, "clubs.manage");
    const prev = await db.club.findUniqueOrThrow({ where: { id: clubId } });
    const next = {
      managementPanel: bool(fd, "managementPanel"),
      memberNumberMode: (["HIDDEN", "OPTIONAL", "REQUIRED"] as const).find((m) => m === str(fd, "memberNumberMode")) ?? prev.memberNumberMode,
      debtBlockScope: (["ADDITIONAL_ONLY", "WHOLE_SHIPMENT"] as const).find((m) => m === str(fd, "debtBlockScope")) ?? null,
    };
    const d = diffFields(prev as unknown as Record<string, unknown>, next);
    await db.club.update({ where: { id: clubId }, data: next });
    await audit(actorOf(u, await clientIp()), { entity: "Club", entityId: clubId, clubId, action: "club.settings", before: d.before, after: d.after });
    revalidatePath(`/admin/clubes/${clubId}`);
    return "Configuración del club guardada.";
  });
}
