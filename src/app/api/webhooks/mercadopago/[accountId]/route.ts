import { db } from "@/shared/db";
import { mpCredentials, processProviderPayment, verifyMpSignature } from "@/modules/payments";
import { deliverPending } from "@/modules/notifications";

export const dynamic = "force-dynamic";

/**
 * Notificaciones de Mercado Pago. Se verifica la firma y luego se consulta el pago a la API:
 * el contenido de la notificación nunca se usa como fuente de verdad.
 */
export async function POST(req: Request, ctx: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await ctx.params;
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as { type?: string; action?: string; data?: { id?: string | number } } | null;
  const type = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body?.type ?? null;
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? (body?.data?.id != null ? String(body.data.id) : null);
  const requestId = req.headers.get("x-request-id");
  const signature = req.headers.get("x-signature");

  const account = await db.paymentAccount.findUnique({ where: { id: accountId } });
  const creds = account ? mpCredentials(account) : null;
  const signatureOk = Boolean(creds && verifyMpSignature({ secret: creds.webhookSecret, signatureHeader: signature, requestId, dataId, toleranceMs: 15 * 60_000 }));

  const eventKey = `mp:${accountId}:${requestId ?? "sin-id"}:${dataId ?? "sin-dato"}:${signature?.match(/ts=(\d+)/)?.[1] ?? ""}`;
  await db.webhookEvent.upsert({
    where: { eventKey },
    create: { provider: "mercadopago", accountId, eventKey, dataId, signatureOk, payload: body ?? undefined },
    update: { count: { increment: 1 } },
  });

  if (!signatureOk) return Response.json({ ok: false }, { status: 401 });
  if (type !== "payment" || !dataId) return Response.json({ ok: true, ignored: true });

  try {
    const result = await processProviderPayment({ kind: "account", accountId }, dataId);
    await db.webhookEvent.update({ where: { eventKey }, data: { result } });
    void deliverPending().catch(() => {});
    return Response.json({ ok: true, result });
  } catch (e) {
    console.error("Error procesando webhook", e);
    // 500: Mercado Pago reintenta más tarde
    return Response.json({ ok: false }, { status: 500 });
  }
}
