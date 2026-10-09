import { createOrder, OrderError } from "@/modules/orders";
import { startOnlinePayment } from "@/modules/payments";
import { deliverPending } from "@/modules/notifications";
import { allow, ipOf } from "@/shared/rate-limit";
import { env } from "@/shared/env";
import { db } from "@/shared/db";
import { UserError } from "@/shared/errors";
import { ensureClubLink, memberFromRequest } from "@/modules/members";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const origin = req.headers.get("origin");
  if (origin && new URL(env().APP_URL).origin !== origin) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  if (!allow(`order:${ipOf(req)}`, Number(process.env.ORDER_RATE_LIMIT ?? 20), 60_000)) return Response.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 64_000) return Response.json({ error: "Pedido demasiado grande." }, { status: 413 });

  // El socio inicia sesión antes de completar la compra (puede armar el carrito sin cuenta)
  const member = await memberFromRequest(req);
  if (!member) return Response.json({ error: "Ingresá con tu cuenta para completar la compra.", code: "login" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }
  try {
    const campaign = await db.campaign.findUnique({ where: { id }, select: { clubId: true, club: { select: { memberNumberMode: true } } } });
    if (!campaign) return Response.json({ error: "La campaña no existe." }, { status: 404 });
    const memberNumber = (body as { buyer?: { memberNumber?: string } })?.buyer?.memberNumber ?? null;
    await ensureClubLink(member.id, campaign.clubId, memberNumber, campaign.club.memberNumberMode);
    const r = await createOrder(id, body, member);
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
    if (e instanceof UserError && !(e instanceof OrderError)) return Response.json({ error: e.message }, { status: 409 });
    if (e instanceof OrderError) return Response.json({ error: e.message, code: e.code }, { status: e.code === "not_found" ? 404 : 409 });
    console.error(e);
    return Response.json({ error: "No pudimos registrar el pedido. Intentá de nuevo." }, { status: 500 });
  }
}
