import Link from "next/link";
import { headers } from "next/headers";
import { requestPasswordReset } from "@/modules/auth";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { allow } from "@/shared/rate-limit";
import type { FormState } from "@/shared/actions-types";
import { BrandMark } from "@/app/_brand/mark";

export const metadata = { title: "Recuperar contraseña", robots: { index: false } };
const NEUTRAL = "Si el correo corresponde a un usuario activo, te enviamos un enlace para elegir una contraseña nueva. Vence en 30 minutos. Si no llega, pedí a la administración de la textil que restablezca tu contraseña.";

async function request(_p: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const email = String(fd.get("email") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Escribí un correo válido." };
  if (!allow(`pwreset:${ip}`, 5, 15 * 60_000)) return { error: "Demasiadas solicitudes. Esperá unos minutos." };
  await requestPasswordReset(email, ip);
  return { ok: NEUTRAL };
}

export default function RecoverPassword() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <BrandMark size="xl" />
        <h1 className="mt-6 text-4xl font-extrabold">Recuperar contraseña</h1>
        <p className="mt-2 text-muted">Te enviamos un enlace al correo con el que ingresás al panel.</p>
        <div className="card mt-6 p-5">
          <ActionForm action={request}>
            <div className="field">
              <label htmlFor="email">Correo</label>
              <input id="email" name="email" type="email" autoComplete="username" className="input" required />
            </div>
            <SubmitButton className="btn btn-primary w-full" pendingText="Enviando…">Enviar enlace</SubmitButton>
          </ActionForm>
        </div>
        <Link href="/admin/ingresar" className="mt-4 inline-block text-sm underline">Volver al ingreso</Link>
      </div>
    </main>
  );
}
