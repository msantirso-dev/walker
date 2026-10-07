import "server-only";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { hmacSha256, randomCode, safeEqualHex } from "@/shared/crypto";
import type { CheckoutRequest, CheckoutResult, PaymentProvider, ProviderPayment, ProviderStatus } from "./types";

/**
 * SIMULADOR. Reemplaza a Mercado Pago solo en pruebas (PAYMENT_SIMULATOR=enabled).
 * Usa el mismo circuito que el webhook real: notificación firmada → consulta al "proveedor" → registro idempotente.
 * Los pagos quedan marcados como simulados y nunca representan dinero.
 */
export class SimulatorProvider implements PaymentProvider {
  readonly name = "simulator" as const;
  readonly simulated = true;

  async createCheckout(r: CheckoutRequest): Promise<CheckoutResult> {
    return { preferenceId: `SIMPREF-${randomCode(8)}`, initPoint: `${env().APP_URL}/pago-simulado/${r.paymentId}` };
  }

  async getPayment(id: string): Promise<ProviderPayment | null> {
    const sp = await db.simulatedPayment.findUnique({ where: { id } });
    if (!sp) return null;
    return {
      id: sp.id,
      status: sp.status as ProviderStatus,
      statusDetail: `simulated_${sp.status.toLowerCase()}`,
      amount: sp.amount,
      currency: "ARS",
      externalReference: sp.paymentId,
    };
  }
}

const simKey = () => hmacSha256(env().CRON_SECRET, "simulator-webhook");

export function signSimulatorEvent(dataId: string, ts: string) {
  return hmacSha256(simKey(), `id:${dataId};ts:${ts};`);
}

export function verifySimulatorEvent(dataId: string, ts: string, sig: string) {
  return safeEqualHex(signSimulatorEvent(dataId, ts), sig);
}
