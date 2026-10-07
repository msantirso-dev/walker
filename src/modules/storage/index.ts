import "server-only";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "@/shared/env";
import { randomToken } from "@/shared/crypto";
import { UserError } from "@/shared/errors";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;

export class UploadError extends UserError {}

const root = () => path.resolve(env().UPLOAD_DIR);

function safeJoin(base: string, rel: string) {
  const p = path.resolve(base, rel);
  if (!p.startsWith(base + path.sep)) throw new UploadError("Ruta inválida");
  return p;
}

function sniff(buf: Buffer): "jpeg" | "png" | "webp" | "pdf" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  return null;
}

/**
 * Imagen pública de catálogo o club. Acepta JPG/PNG/WebP hasta 5 MB,
 * la recodifica a WebP (sin metadatos) con lado mayor ≤ 2000 px.
 */
export async function saveImage(buf: Buffer, folder: string): Promise<string> {
  if (buf.length > IMAGE_MAX_BYTES) throw new UploadError("La imagen supera 5 MB.");
  const kind = sniff(buf);
  if (!kind || kind === "pdf") throw new UploadError("Formato no admitido. Usá JPG, PNG o WebP.");
  let out: Buffer;
  try {
    const img = sharp(buf, { limitInputPixels: 40_000_000 }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200)
      throw new UploadError("La imagen es muy chica (mínimo 200 × 200 px).");
    out = await img.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  } catch (e) {
    if (e instanceof UploadError) throw e;
    throw new UploadError("No se pudo leer la imagen. Probá con otro archivo.");
  }
  const rel = path.posix.join("public", folder.replace(/[^a-zA-Z0-9_-]/g, ""), `${randomToken(12)}.webp`);
  const abs = safeJoin(root(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, out);
  return "/files/" + rel.slice("public/".length);
}

/** Comprobante de pago privado: JPG/PNG/WebP (recodificado) o PDF, hasta 8 MB. */
export async function saveReceipt(buf: Buffer, orderId: string): Promise<{ key: string; mime: string; size: number }> {
  if (buf.length > RECEIPT_MAX_BYTES) throw new UploadError("El comprobante supera 8 MB.");
  const kind = sniff(buf);
  if (!kind) throw new UploadError("Formato no admitido. Subí una imagen (JPG, PNG, WebP) o un PDF.");
  let data = buf;
  let ext: string = kind;
  let mime = "application/pdf";
  if (kind !== "pdf") {
    try {
      data = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    } catch {
      throw new UploadError("No se pudo leer la imagen del comprobante.");
    }
    ext = "webp";
    mime = "image/webp";
  }
  const key = path.posix.join("private", orderId.replace(/[^a-zA-Z0-9]/g, ""), `${randomToken(12)}.${ext}`);
  const abs = safeJoin(root(), key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return { key, mime, size: data.length };
}

export async function readStored(key: string): Promise<Buffer | null> {
  try {
    const abs = safeJoin(root(), key);
    await stat(abs);
    return await readFile(abs);
  } catch {
    return null;
  }
}

/** Guarda un archivo de demostración (seed) ya generado por nosotros. */
export async function savePublicRaw(rel: string, data: Buffer): Promise<string> {
  const abs = safeJoin(root(), path.posix.join("public", rel));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return "/files/" + rel;
}
