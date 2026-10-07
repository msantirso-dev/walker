import { timingSafeEqual } from "node:crypto";
import { env } from "@/shared/env";
import { expireReservations } from "@/modules/orders";
import { closeExpiredCampaigns } from "@/modules/campaigns";
import { deliverPending } from "@/modules/notifications";

export const dynamic = "force-dynamic";

/** Tarea programada (cada 5 minutos): vence reservas, cierra campañas por fecha y envía correos. */
export async function POST(req: Request) {
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(env().CRON_SECRET);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new Response("No autorizado", { status: 401 });
  const expired = await expireReservations();
  const closed = await closeExpiredCampaigns();
  await deliverPending(200);
  return Response.json({ ok: true, expired, closed });
}
