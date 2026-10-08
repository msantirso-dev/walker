import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, login } from "@/modules/auth";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import type { FormState } from "@/shared/actions-types";
import { BrandMark } from "@/shared/ui/brand";

export const metadata = { title: "Ingresar" };

async function doLogin(_prev: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const r = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!r.ok) return { error: r.error };
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ restablecida?: string }> }) {
  if (await currentUser()) redirect("/admin");
  const { restablecida } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <BrandMark className="h-12" />
        <h1 className="mt-6 text-5xl font-extrabold">Panel</h1>
        <p className="mt-2 text-muted">Textil, clubes, producción y entregas.</p>
        {restablecida && <p className="notice notice-ok mt-6">Contraseña actualizada. Ingresá con la nueva.</p>}
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
        <Link href="/admin/recuperar" className="mt-4 inline-block text-sm underline">¿Olvidaste tu contraseña?</Link>
      </div>
    </main>
  );
}
