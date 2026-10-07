import { db } from "@/shared/db";
import { sha256 } from "@/shared/crypto";
import { readStored } from "@/modules/storage";
import { currentUser, can } from "@/modules/auth";

export const dynamic = "force-dynamic";

/** Comprobantes privados: los ve el comprador (con su enlace) o un usuario autorizado del club o la textil. */
export async function GET(req: Request, ctx: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await ctx.params;
  const r = await db.receipt.findUnique({ where: { id: receiptId }, include: { payment: { include: { order: true } } } });
  if (!r) return new Response("No encontrado", { status: 404 });
  const token = new URL(req.url).searchParams.get("t");
  const order = r.payment.order;
  let allowed = Boolean(token && sha256(token) === order.accessTokenHash);
  if (!allowed) {
    const u = await currentUser();
    allowed = Boolean(u && can(u, "orders.view", order.clubId));
  }
  if (!allowed) return new Response("No encontrado", { status: 404 });
  const data = await readStored(r.fileKey);
  if (!data) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": r.mime,
      "Content-Disposition": `${r.mime === "application/pdf" ? "attachment" : "inline"}; filename="comprobante-${order.code}.${r.mime === "application/pdf" ? "pdf" : "webp"}"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
