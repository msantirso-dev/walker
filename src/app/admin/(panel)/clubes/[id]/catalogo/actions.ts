"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/db";
import { run, str, opt, bool, int, fileBuf, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { parsePesos } from "@/shared/money";
import { requireUser, assertCan, actorOf, clientIp } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { saveImage } from "@/modules/storage";
import type { SizeGroup } from "@/generated/prisma/client";
import { PRESETS } from "./presets";

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,29}$/;


async function guard(clubId: string) {
  const u = await requireUser();
  assertCan(u, "catalog.manage");
  const club = await db.club.findUnique({ where: { id: clubId } });
  if (!club) throw new UserError("Club inexistente.");
  return { u, actor: actorOf(u, await clientIp()) };
}

const garmentSchema = z.object({
  code: z.string().regex(CODE_RE, "Código: mayúsculas, números y guiones (ej. CAM-TIT-26)"),
  name: z.string().min(2).max(80),
  variant: z.string().max(60).nullable(),
  material: z.string().max(300).nullable(),
  care: z.string().max(300).nullable(),
  measureA: z.string().min(2).max(40),
  measureB: z.string().min(2).max(40),
  measureUnit: z.enum(["cm", "pulg"]),
  measureNote: z.string().max(300).nullable(),
});
const readGarment = (fd: FormData) =>
  garmentSchema.parse({
    code: str(fd, "code").toUpperCase(), name: str(fd, "name"), variant: opt(fd, "variant"), material: opt(fd, "material"), care: opt(fd, "care"),
    measureA: str(fd, "measureA") || "Ancho de pecho", measureB: str(fd, "measureB") || "Largo", measureUnit: (str(fd, "measureUnit") || "cm") as "cm", measureNote: opt(fd, "measureNote"),
  });

export async function createGarment(clubId: string, _p: FormState, fd: FormData): Promise<FormState> {
  let gid = "";
  const res = await run(async () => {
    const { actor } = await guard(clubId);
    const data = readGarment(fd);
    if (await db.garment.findUnique({ where: { clubId_code: { clubId, code: data.code } } })) throw new UserError("Ya existe una prenda con ese código en el club.");
    let sort = 0;
    const sizes = Object.entries(PRESETS)
      .filter(([k]) => bool(fd, `preset_${k}`))
      .flatMap(([, p]) => p.labels.map((label) => ({ label, group: p.group, sort: (sort += 10) })));
    if (!sizes.length) throw new UserError("Elegí al menos un grupo de talles. Después podés agregar, quitar y ordenar talles.");
    const g = await db.garment.create({ data: { ...data, clubId, sizes: { create: sizes } } });
    await audit(actor, { entity: "Garment", entityId: g.id, clubId, action: "garment.created", data: { code: g.code } });
    gid = g.id;
  });
  if (gid) redirect(`/admin/clubes/${clubId}/catalogo/prendas/${gid}`);
  return res;
}

export async function updateGarment(clubId: string, garmentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await guard(clubId);
    const data = readGarment(fd);
    const other = await db.garment.findUnique({ where: { clubId_code: { clubId, code: data.code } } });
    if (other && other.id !== garmentId) throw new UserError("Ya existe una prenda con ese código.");
    await db.garment.update({ where: { id: garmentId, clubId }, data: { ...data, active: bool(fd, "active") } });
    await audit(actor, { entity: "Garment", entityId: garmentId, clubId, action: "garment.updated" });
    revalidatePath(`/admin/clubes/${clubId}/catalogo/prendas/${garmentId}`);
  });
}

/** Guarda la tabla de talles y medidas completa. */
export async function saveSizes(clubId: string, garmentId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await guard(clubId);
    const g = await db.garment.findFirst({ where: { id: garmentId, clubId }, include: { sizes: true } });
    if (!g) throw new UserError("Prenda inexistente.");
    const num = (v: string) => {
      if (!v) return null;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 999) throw new UserError(`Medida inválida: ${v}`);
      return n;
    };
    const ops = [];
    for (const s of g.sizes) {
      if (bool(fd, `del_${s.id}`)) {
        ops.push(db.garmentSize.delete({ where: { id: s.id } }));
        continue;
      }
      ops.push(
        db.garmentSize.update({
          where: { id: s.id },
          data: { sort: int(fd, `sort_${s.id}`, s.sort), measureA: num(str(fd, `a_${s.id}`)), measureB: num(str(fd, `b_${s.id}`)), enabled: bool(fd, `en_${s.id}`) },
        }),
      );
    }
    const newLabel = str(fd, "new_label").toUpperCase();
    if (newLabel) {
      if (!/^[A-Z0-9]{1,6}$/.test(newLabel)) throw new UserError("Talle nuevo: hasta 6 letras o números.");
      if (g.sizes.some((s) => s.label === newLabel)) throw new UserError("Ese talle ya existe en la prenda.");
      const group = str(fd, "new_group") as SizeGroup;
      if (!["KIDS", "NUMERIC", "ALPHA", "OTHER"].includes(group)) throw new UserError("Grupo de talle inválido.");
      ops.push(db.garmentSize.create({ data: { garmentId, label: newLabel, group, sort: int(fd, "new_sort", 999), measureA: num(str(fd, "new_a")), measureB: num(str(fd, "new_b")) } }));
    }
    await db.$transaction(ops);
    await audit(actor, { entity: "Garment", entityId: garmentId, clubId, action: "garment.sizes" });
    revalidatePath(`/admin/clubes/${clubId}/catalogo/prendas/${garmentId}`);
    return "Talles y medidas guardados. Los pedidos ya hechos conservan el talle elegido.";
  });
}

const productSchema = z.object({
  code: z.string().regex(CODE_RE, "Código: mayúsculas, números y guiones (ej. P-CAM-TIT)"),
  name: z.string().min(2).max(80),
  kind: z.enum(["SIMPLE", "SET", "COMBO"]),
  description: z.string().max(800).nullable(),
  audience: z.string().max(80).nullable(),
  sportId: z.string().nullable(),
  basePrice: z.number().int().positive("Precio base inválido"),
  manufacturingTerms: z.string().max(500).nullable(),
  family: z.enum(["GAME_KIT", "OUTFIT", "ACCESSORY", "OTHER"]),
  technique: z.enum(["PENDING", "SUBLIMATED", "NON_SUBLIMATED", "EMBROIDERED", "PRINTED", "OTHER"]),
  catalogStatus: z.enum(["PREPARATION", "CATALOG", "PRESALE", "PRESALE_CLOSED", "ARCHIVED"]),
});

function readProduct(fd: FormData) {
  const d = productSchema.parse({
    code: str(fd, "code").toUpperCase(), name: str(fd, "name"), kind: str(fd, "kind") || "SIMPLE", description: opt(fd, "description"), audience: opt(fd, "audience"),
    sportId: opt(fd, "sportId"), basePrice: parsePesos(str(fd, "basePrice")) ?? 0, manufacturingTerms: opt(fd, "manufacturingTerms"),
    family: str(fd, "family") || "OTHER", technique: str(fd, "technique") || "PENDING", catalogStatus: str(fd, "catalogStatus") || "PREPARATION",
  });
  return d;
}

function readComponents(fd: FormData) {
  const out: { label: string; garmentId: string; printTarget: boolean; sort: number }[] = [];
  const target = str(fd, "printTarget");
  for (let i = 0; i < 4; i++) {
    const garmentId = str(fd, `c${i}_garment`);
    const label = str(fd, `c${i}_label`);
    if (!garmentId) continue;
    if (label.length < 2 || label.length > 30) throw new UserError(`Componente ${i + 1}: escribí una etiqueta (ej. Camiseta).`);
    out.push({ label, garmentId, printTarget: target === String(i), sort: i });
  }
  if (!out.length) throw new UserError("Agregá al menos un componente (prenda).");
  if (new Set(out.map((c) => c.label)).size !== out.length) throw new UserError("Las etiquetas de los componentes deben ser distintas.");
  return out;
}

export async function createProduct(clubId: string, _p: FormState, fd: FormData): Promise<FormState> {
  let pid = "";
  const res = await run(async () => {
    const { actor } = await guard(clubId);
    const data = readProduct(fd);
    const comps = readComponents(fd);
    if (data.kind === "SIMPLE" && comps.length > 1) throw new UserError("Un producto simple tiene un solo componente. Usá Conjunto o Combo.");
    if (data.kind !== "SIMPLE" && comps.length < 2) throw new UserError("Un conjunto o combo necesita al menos dos componentes.");
    const valid = await db.garment.count({ where: { clubId, id: { in: comps.map((c) => c.garmentId) } } });
    if (valid !== new Set(comps.map((c) => c.garmentId)).size) throw new UserError("Hay una prenda que no pertenece al club.");
    if (await db.product.findUnique({ where: { clubId_code: { clubId, code: data.code } } })) throw new UserError("Ya existe un producto con ese código.");
    const p = await db.product.create({ data: { ...data, clubId, components: { create: comps } } });
    await audit(actor, { entity: "Product", entityId: p.id, clubId, action: "product.created", data: { code: p.code, basePrice: p.basePrice } });
    pid = p.id;
  });
  if (pid) redirect(`/admin/clubes/${clubId}/catalogo/productos/${pid}`);
  return res;
}

export async function updateProduct(clubId: string, productId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await guard(clubId);
    const before = await db.product.findFirst({ where: { id: productId, clubId } });
    if (!before) throw new UserError("Producto inexistente.");
    const data = readProduct(fd);
    const comps = readComponents(fd);
    if (data.kind === "SIMPLE" && comps.length > 1) throw new UserError("Un producto simple tiene un solo componente.");
    if (data.kind !== "SIMPLE" && comps.length < 2) throw new UserError("Un conjunto o combo necesita al menos dos componentes.");
    const valid = await db.garment.count({ where: { clubId, id: { in: comps.map((c) => c.garmentId) } } });
    if (valid !== new Set(comps.map((c) => c.garmentId)).size) throw new UserError("Hay una prenda que no pertenece al club.");
    await db.$transaction([
      db.product.update({ where: { id: productId }, data: { ...data, active: bool(fd, "active") } }),
      db.productComponent.deleteMany({ where: { productId } }),
      db.productComponent.createMany({ data: comps.map((c) => ({ ...c, productId })) }),
    ]);
    await audit(actor, { entity: "Product", entityId: productId, clubId, action: "product.updated", data: { basePrice: [before.basePrice, data.basePrice] } });
    revalidatePath(`/admin/clubes/${clubId}/catalogo/productos/${productId}`);
    return "Producto guardado. Los pedidos existentes conservan su copia de precio, descripción y talles.";
  });
}

export async function addProductImage(clubId: string, productId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await guard(clubId);
    const p = await db.product.findFirst({ where: { id: productId, clubId }, include: { _count: { select: { images: true } } } });
    if (!p) throw new UserError("Producto inexistente.");
    if (p._count.images >= 10) throw new UserError("Máximo 10 imágenes por producto.");
    const f = await fileBuf(fd, "image");
    if (!f) throw new UserError("Elegí una imagen.");
    const view = str(fd, "view");
    const tag = str(fd, "tag");
    if (!["FRONT", "BACK", "DETAIL", "OTHER"].includes(view) || !["REAL", "DESIGN", "REFERENCE"].includes(tag)) throw new UserError("Elegí vista y etiqueta.");
    await db.productImage.create({ data: { productId, url: await saveImage(f, `prod-${productId}`), view: view as never, tag: tag as never, alt: opt(fd, "alt"), sort: p._count.images } });
    revalidatePath(`/admin/clubes/${clubId}/catalogo/productos/${productId}`);
    return "Imagen agregada.";
  });
}

export async function updateImage(clubId: string, imageId: string, fd: FormData) {
  await guard(clubId);
  const img = await db.productImage.findFirst({ where: { id: imageId, product: { clubId } } });
  if (!img) return;
  if (bool(fd, "delete")) await db.productImage.delete({ where: { id: imageId } });
  else await db.productImage.update({ where: { id: imageId }, data: { tag: str(fd, "tag") as never, view: str(fd, "view") as never, sort: int(fd, "sort", img.sort) } });
  revalidatePath(`/admin/clubes/${clubId}/catalogo/productos/${img.productId}`);
}

/** Grupo de opciones del configurador. Valores de elección: una línea por valor "Etiqueta | precio textil | precio club". */
export async function saveOptionGroupAction(clubId: string, productId: string, groupId: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await guard(clubId);
    const { saveOptionGroup } = await import("@/modules/catalog/admin");
    const values = str(fd, "values")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [label, t, c] = l.split("|").map((x) => x.trim());
        return { label, priceTextil: t ? (parsePesos(t) ?? -1) : 0, priceClub: c ? (parsePesos(c) ?? -1) : 0 };
      });
    const type = str(fd, "type");
    const role = str(fd, "role");
    await saveOptionGroup(actor, clubId, productId, groupId, {
      name: str(fd, "name"), type: (["CHOICE", "TEXT", "NUMBER"].includes(type) ? type : "CHOICE") as never, role: (["NAME", "NUMBER", "LEGEND", "OTHER"].includes(role) ? role : "OTHER") as never,
      required: bool(fd, "required"), sort: int(fd, "sort", 0), help: opt(fd, "help"), dependsOnValueIds: fd.getAll("dependsOnValueIds").map(String),
      maxLength: str(fd, "maxLength") ? int(fd, "maxLength", 12) : null, numberMin: str(fd, "numberMin") ? int(fd, "numberMin", 0) : null, numberMax: str(fd, "numberMax") ? int(fd, "numberMax", 99) : null,
      priceTextil: parsePesos(str(fd, "priceTextil") || "0") ?? 0, priceClub: parsePesos(str(fd, "priceClub") || "0") ?? 0,
      splitConfirmed: bool(fd, "splitConfirmed"), blocksSizeChange: bool(fd, "blocksSizeChange"), values,
    });
    revalidatePath(`/admin/clubes/${clubId}/catalogo/productos/${productId}`);
    return "Opciones guardadas. Los pedidos hechos conservan lo que eligieron.";
  });
}

export async function deleteOptionGroupAction(clubId: string, productId: string, groupId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return run(async () => {
    const { actor } = await guard(clubId);
    const { deleteOptionGroup } = await import("@/modules/catalog/admin");
    await deleteOptionGroup(actor, clubId, productId, groupId);
    revalidatePath(`/admin/clubes/${clubId}/catalogo/productos/${productId}`);
    return "Grupo eliminado.";
  });
}
