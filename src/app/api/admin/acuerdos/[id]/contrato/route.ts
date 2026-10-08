import { db } from "@/shared/db";
import { readStored } from "@/modules/storage";
import { currentUser, can } from "@/modules/auth";

export const dynamic = "force-dynamic";

/** Contrato del acuerdo: solo la textil. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = await currentUser();
  if (!u || !can(u, "agreements.manage")) return new Response("No encontrado", { status: 404 });
  const a = await db.clubAgreement.findUnique({ where: { id } });
  if (!a?.contractFileKey) return new Response("No encontrado", { status: 404 });
  const data = await readStored(a.contractFileKey);
  if (!data) return new Response("No encontrado", { status: 404 });
  const ext = a.contractFileKey.split(".").pop() ?? "pdf";
  const type = ext === "pdf" ? "application/pdf" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": type, "Content-Disposition": `attachment; filename="contrato.${ext}"`, "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
