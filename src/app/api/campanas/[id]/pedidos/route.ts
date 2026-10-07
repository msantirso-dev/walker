import { createOrder, OrderError } from "@/modules/orders";
import { startOnlinePayment } from "@/modules/payments";
import { deliverPending } from "@/modules/notifications";
import { allow, ipOf } from "@/shared/rate-limit";
import { env } from "@/shared/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = req.headers.get("origin");
  if (origin && new URL(env().APP_URL).origin !== origin) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  if (!allow(`order:${ipOf(req)}`, 20, 60_000)) return Response.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 64_000) return Response.json({ error: "Pedido demasiado grande." }, { status: 413 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }
  try {
    const r = await createOrder(id, body);
    const page = `/pedido/${r.token}`;
    void deliverPending().catch(() => {});
    if (r.payMethod === "MERCADOPAGO") {
      try {
        const url = await startOnlinePayment(r.orderId, r.payKind);
        return Response.json({ redirect: url, order: r.code });
      } catch (e) {
        // El pedido quedó registrado: el comprador puede reintentar el pago desde su enlace.
        console.error("No se pudo iniciar el checkout", e);
        return Response.json({ redirect: `${page}?nuevo=1&pago=error`, order: r.code });
      }
    }
    return Response.json({ redirect: `${page}?nuevo=1`, order: r.code });
  } catch (e) {
    if (e instanceof OrderError) return Response.json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 409 });
    console.error(e);
    return Response.json({ error: "No pudimos registrar el pedido. Intentá de nuevo." }, { status: 500 });
  }
}
