import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const hmacSha256 = (key: string, v: string) => createHmac("sha256", key).update(v).digest("hex");

/** Token aleatorio URL-safe (por defecto 256 bits). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sin 0/O/1/I/L
export function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

const key = () => Buffer.from(env().APP_ENCRYPTION_KEY, "base64");

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Formato de secreto desconocido");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
