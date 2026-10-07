import "server-only";
import { decryptSecret, encryptSecret } from "@/shared/crypto";
import { env, simulatorEnabled } from "@/shared/env";
import { MercadoPagoProvider } from "./providers/mercadopago";
import { SimulatorProvider } from "./providers/simulator";
import type { PaymentProvider } from "./providers/types";

type Account = {
  id: string;
  owner: "TEXTIL" | "CLUB";
  mpAccessTokenEnc: string | null;
  mpWebhookSecretEnc: string | null;
};

/** Credenciales de Mercado Pago de la cuenta (o de la textil por entorno). Nunca salen del servidor. */
export function mpCredentials(a: Account): { accessToken: string; webhookSecret: string } | null {
  if (a.mpAccessTokenEnc && a.mpWebhookSecretEnc) {
    return { accessToken: decryptSecret(a.mpAccessTokenEnc), webhookSecret: decryptSecret(a.mpWebhookSecretEnc) };
  }
  if (a.owner === "TEXTIL" && env().MP_ACCESS_TOKEN && env().MP_WEBHOOK_SECRET) {
    return { accessToken: env().MP_ACCESS_TOKEN!, webhookSecret: env().MP_WEBHOOK_SECRET! };
  }
  return null;
}

export type OnlineMode = "mercadopago" | "simulator" | "unavailable";

export function onlineMode(a: Account): OnlineMode {
  if (mpCredentials(a)) return "mercadopago";
  if (simulatorEnabled()) return "simulator";
  return "unavailable";
}

export function providerFor(a: Account): PaymentProvider | null {
  const creds = mpCredentials(a);
  if (creds) return new MercadoPagoProvider(creds.accessToken);
  if (simulatorEnabled()) return new SimulatorProvider();
  return null;
}

export function sealCredential(v: string) {
  return encryptSecret(v.trim());
}

/** Para mostrar en el panel sin revelar el secreto. */
export function maskTail(v: string) {
  const t = v.trim();
  return `••••${t.slice(-4)}`;
}
