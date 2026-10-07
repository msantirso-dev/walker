import "server-only";
import { hmacSha256, safeEqualHex } from "@/shared/crypto";
import { env } from "@/shared/env";
import { ProviderError, type CheckoutRequest, type CheckoutResult, type PaymentProvider, type ProviderPayment, type ProviderStatus } from "./types";

/**
 * Mercado Pago Checkout Pro por REST (documentación oficial vigente, oct. 2026):
 * - POST /checkout/preferences → init_point (checkout alojado)
 * - GET  /v1/payments/{id}     → estado real del pago
 * - Webhook firmado: header x-signature "ts=…,v1=…", HMAC-SHA256 del manifiesto
 *   "id:[data.id];request-id:[x-request-id];ts:[ts];" con la clave secreta de la aplicación.
 */
export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago" as const;
  readonly simulated = false;
  constructor(private accessToken: string) {}

  private async call(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
    const res = await fetch(env().MP_API_BASE + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  }

  async createCheckout(r: CheckoutRequest): Promise<CheckoutResult> {
    const pref = {
      items: [{ id: r.orderCode, title: r.title.slice(0, 250), quantity: 1, unit_price: r.amount / 100, currency_id: "ARS" }],
      payer: { email: r.payerEmail, name: r.payerName },
      external_reference: r.paymentId,
      notification_url: r.notificationUrl,
      back_urls: { success: r.backUrl, pending: r.backUrl, failure: r.backUrl },
      auto_return: "approved",
      expires: true,
      expiration_date_to: r.expiresAt.toISOString(),
      statement_descriptor: r.statementDescriptor?.slice(0, 22),
      binary_mode: false,
      metadata: { order_code: r.orderCode },
    };
    const res = await this.call("/checkout/preferences", { method: "POST", body: JSON.stringify(pref), idempotencyKey: r.paymentId });
    if (!res.ok || !res.body?.id || !res.body?.init_point) {
      throw new ProviderError(`Mercado Pago rechazó la preferencia (${res.status}).`);
    }
    return { preferenceId: String(res.body.id), initPoint: String(res.body.init_point) };
  }

  async getPayment(id: string): Promise<ProviderPayment | null> {
    if (!/^\d{1,20}$/.test(id)) return null;
    const res = await this.call(`/v1/payments/${id}`);
    if (res.status === 404) return null;
    if (!res.ok || !res.body) throw new ProviderError(`No se pudo consultar el pago ${id} (${res.status}).`);
    const b = res.body;
    return {
      id: String(b.id),
      status: mapStatus(String(b.status)),
      statusDetail: String(b.status_detail ?? b.status),
      amount: Math.round(Number(b.transaction_amount) * 100),
      currency: String(b.currency_id ?? ""),
      externalReference: b.external_reference ? String(b.external_reference) : null,
    };
  }
}

export function mapStatus(s: string): ProviderStatus {
  switch (s) {
    case "approved":
      return "APPROVED";
    case "rejected":
      return "REJECTED";
    case "cancelled":
      return "CANCELLED";
    case "refunded":
    case "charged_back":
      return "REFUNDED";
    default: // pending, in_process, authorized, in_mediation
      return "PENDING";
  }
}

/** Verifica la firma x-signature de una notificación de Mercado Pago. */
export function verifyMpSignature(opts: {
  secret: string;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  toleranceMs?: number;
  now?: number;
}): boolean {
  if (!opts.signatureHeader) return false;
  const parts = Object.fromEntries(
    opts.signatureHeader.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  // Si data.id es alfanumérico, Mercado Pago indica usarlo en minúsculas.
  const id = opts.dataId ? (/^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId) : null;
  let manifest = "";
  if (id) manifest += `id:${id};`;
  if (opts.requestId) manifest += `request-id:${opts.requestId};`;
  manifest += `ts:${ts};`;
  if (!safeEqualHex(hmacSha256(opts.secret, manifest), v1)) return false;
  if (opts.toleranceMs) {
    const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000;
    if (!Number.isFinite(tsMs) || Math.abs((opts.now ?? Date.now()) - tsMs) > opts.toleranceMs) return false;
  }
  return true;
}
