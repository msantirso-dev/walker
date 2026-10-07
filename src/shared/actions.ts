import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { UserError } from "./errors";

export type { FormState } from "./actions-types";
import type { FormState } from "./actions-types";

/** Ejecuta una acción del panel y traduce errores esperables a mensajes. */
export async function run(fn: () => Promise<string | void>): Promise<FormState> {
  try {
    const ok = await fn();
    return { ok: ok || "Cambios guardados." };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Datos inválidos." };
    console.error(e);
    return { error: "No se pudo completar la operación. Intentá de nuevo." };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const opt = (fd: FormData, k: string) => str(fd, k) || null;
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export const int = (fd: FormData, k: string, def = 0) => {
  const n = Number.parseInt(str(fd, k), 10);
  return Number.isFinite(n) ? n : def;
};
export const intOrNull = (fd: FormData, k: string) => {
  const s = str(fd, k);
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};
export async function fileBuf(fd: FormData, k: string): Promise<Buffer | null> {
  const f = fd.get(k);
  if (!f || typeof f === "string" || f.size === 0) return null;
  return Buffer.from(await f.arrayBuffer());
}
