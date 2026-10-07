import { db } from "@/shared/db";
import { simulatorEnabled } from "@/shared/env";
import { processProviderPayment, verifySimulatorEvent } from "@/modules/payments";
import { deliverPending } from "@/modules/notifications";

export const dynamic = "force-dynamic";

/** Webhook del SIMULADOR (solo pruebas). Mismo circuito que el real: firma → consulta → registro idempotente. */
export async function POST(req: Request) {
  if (!simulatorEnabled()) return new Response("No disponible", { status: 404 });
  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id");
  const [ts, sig] = (req.headers.get("x-simulator-signature") ?? "").split(",");
  const ok = Boolean(dataId && ts && sig && verifySimulatorEvent(dataId, ts, sig));
  const eventKey = `sim:${dataId}:${ts}`;
  await db.webhookEvent.upsert({
    where: { eventKey },
    create: { provider: "simulator", eventKey, dataId, signatureOk: ok },
    update: { count: { increment: 1 } },
  });
  if (!ok) return Response.json({ ok: false }, { status: 401 });
  const result = await processProviderPayment({ kind: "simulator" }, dataId!);
  await db.webhookEvent.update({ where: { eventKey }, data: { result } });
  void deliverPending().catch(() => {});
  return Response.json({ ok: true, result });
}
