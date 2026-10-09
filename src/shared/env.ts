import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url(),
  /** 32 bytes en base64. Cifra credenciales de cobro. */
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "APP_ENCRYPTION_KEY debe ser 32 bytes en base64"),
  CRON_SECRET: z.string().min(16),
  UPLOAD_DIR: z.string().default("/data/uploads"),
  /** "enabled" habilita el simulador de pagos. Nunca usar con dinero real. */
  PAYMENT_SIMULATOR: z.enum(["enabled", "disabled"]).default("disabled"),
  /** Credenciales de Mercado Pago de la textil (opcionales; los clubes cargan las suyas en el panel). */
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  MP_API_BASE: z.string().url().default("https://api.mercadopago.com"),
  /** smtp(s)://usuario:clave@host:puerto. Si falta, los correos quedan como "no enviados". */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("BACK <no-responder@example.com>"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Variables de entorno inválidas: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
export const simulatorEnabled = () => env().PAYMENT_SIMULATOR === "enabled";
export const emailConfigured = () => Boolean(env().SMTP_URL);
