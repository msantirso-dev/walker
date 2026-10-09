import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { findValidReset, resetPassword, MIN_PASSWORD } from "@/modules/auth";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { run, str } from "@/shared/actions";
import type { FormState } from "@/shared/actions-types";
import { BrandMark } from "@/app/_brand/mark";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva contraseña", robots: { index: false } };

async function doReset(token: string, _p: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  let done = false;
  const res = await run(async () => {
    await resetPassword(token, str(fd, "password"), str(fd, "confirm"), ip);
    done = true;
  });
  if (done) redirect("/admin/ingresar?restablecida=1");
  return res;
}

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await findValidReset(token);
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <BrandMark size="xl" />
        <h1 className="mt-6 text-4xl font-extrabold">Nueva contraseña</h1>
        {!r ? (
          <div className="card mt-6 grid gap-3 p-5">
            <p>El enlace venció o ya fue usado.</p>
            <Link href="/admin/recuperar" className="btn btn-primary">Pedir un enlace nuevo</Link>
          </div>
        ) : (
          <div className="card mt-6 p-5">
            <p className="mb-4 text-sm text-muted">Usuario: {r.user.email}. Al guardar se cierran todas tus sesiones abiertas.</p>
            <ActionForm action={doReset.bind(null, token)}>
              <div className="field">
                <label htmlFor="password">Contraseña nueva</label>
                <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} className="input" required />
                <small>Mínimo {MIN_PASSWORD} caracteres.</small>
              </div>
              <div className="field">
                <label htmlFor="confirm">Repetila</label>
                <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} className="input" required />
              </div>
              <SubmitButton className="btn btn-primary w-full">Guardar contraseña</SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
    </main>
  );
}
