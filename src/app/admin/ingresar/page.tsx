import { redirect } from "next/navigation";
import { currentUser, login } from "@/modules/auth";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import type { FormState } from "@/shared/actions-types";

export const metadata = { title: "Ingresar" };

async function doLogin(_prev: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const r = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!r.ok) return { error: r.error };
  redirect("/admin");
}

export default async function LoginPage() {
  if (await currentUser()) redirect("/admin");
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="font-display text-2xl font-extrabold uppercase tracking-wider">{process.env.PLATFORM_NAME ?? "Camada"}</div>
        <h1 className="mt-6 text-5xl font-extrabold">Panel</h1>
        <p className="mt-2 text-muted">Textil, clubes, producción y entregas.</p>
        <div className="card mt-6 p-5">
          <ActionForm action={doLogin}>
            <div className="field">
              <label htmlFor="email">Correo</label>
              <input id="email" name="email" type="email" autoComplete="username" className="input" required />
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <input id="password" name="password" type="password" autoComplete="current-password" className="input" required />
            </div>
            <SubmitButton className="btn btn-primary w-full" pendingText="Ingresando…">Ingresar</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
