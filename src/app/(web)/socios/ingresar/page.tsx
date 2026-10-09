import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/shared/db";
import { currentMember, MEMBER_MIN_PASSWORD, safeNext } from "@/modules/members";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { memberLoginAction, memberRegisterAction } from "../actions";

export const metadata = { title: "Ingresar" };

type SP = Promise<{ club?: string; next?: string; modo?: string; restablecida?: string }>;

/** Acceso y registro del socio. Conserva el club elegido y vuelve a la tienda (con el carrito guardado). */
export default async function MemberLogin({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const club = sp.club ? await db.club.findUnique({ where: { slug: sp.club }, select: { name: true, slug: true, logoUrl: true, colorPrimary: true } }) : null;
  const next = safeNext(sp.next, club ? `/club/${club.slug}` : "/mi-cuenta");
  if (await currentMember()) redirect(next);
  const register = sp.modo === "registro";
  const q = (modo?: string) => `/socios/ingresar?${new URLSearchParams({ ...(club ? { club: club.slug } : {}), next, ...(modo ? { modo } : {}) })}`;
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      {club && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-lg" style={{ background: club.colorPrimary }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {club.logoUrl && <img src={club.logoUrl} alt="" className="h-9 w-9 object-contain" />}
          </span>
          <div className="min-w-0">
            <div className="text-sm text-muted">Tienda de</div>
            <div className="truncate font-display text-xl font-bold uppercase">{club.name}</div>
          </div>
        </div>
      )}
      <h1 className="text-5xl font-extrabold">{register ? "Crear cuenta" : "Ingresar"}</h1>
      <p className="mt-2 text-muted">{register ? "Con tu cuenta pagás tus pedidos y seguís la producción y la entrega." : "Ingresá para pagar tu pedido y ver tus compras."}</p>
      {sp.restablecida && <p className="notice notice-ok mt-4">Contraseña actualizada. Ingresá con la nueva.</p>}
      <div className="card mt-6 p-5">
        {register ? (
          <ActionForm action={memberRegisterAction}>
            <input type="hidden" name="next" value={next} />
            <div className="field"><label htmlFor="m-name">Nombre y apellido</label><input id="m-name" name="name" className="input" autoComplete="name" required /></div>
            <div className="field"><label htmlFor="m-email">Correo</label><input id="m-email" name="email" type="email" className="input" autoComplete="email" required /></div>
            <div className="field"><label htmlFor="m-phone">Celular</label><input id="m-phone" name="phone" type="tel" className="input" autoComplete="tel" placeholder="11 5555 5555" required /></div>
            <div className="field"><label htmlFor="m-pass">Contraseña</label><input id="m-pass" name="password" type="password" className="input" autoComplete="new-password" minLength={MEMBER_MIN_PASSWORD} required /><small>Al menos {MEMBER_MIN_PASSWORD} caracteres.</small></div>
            <div className="field"><label htmlFor="m-conf">Repetí la contraseña</label><input id="m-conf" name="confirm" type="password" className="input" autoComplete="new-password" required /></div>
            <SubmitButton pendingText="Creando…">Crear cuenta y continuar</SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={memberLoginAction}>
            <input type="hidden" name="next" value={next} />
            <div className="field"><label htmlFor="m-email">Correo</label><input id="m-email" name="email" type="email" className="input" autoComplete="username" required /></div>
            <div className="field"><label htmlFor="m-pass">Contraseña</label><input id="m-pass" name="password" type="password" className="input" autoComplete="current-password" required /></div>
            <SubmitButton pendingText="Ingresando…">Ingresar</SubmitButton>
          </ActionForm>
        )}
      </div>
      <p className="mt-4 text-sm">
        {register ? (
          <>¿Ya tenés cuenta? <Link className="font-semibold underline" href={q()}>Ingresá</Link></>
        ) : (
          <>¿Primera vez? <Link className="font-semibold underline" href={q("registro")}>Creá tu cuenta</Link> · <Link className="underline" href="/socios/recuperar">Olvidé mi contraseña</Link></>
        )}
      </p>
      <p className="mt-6 text-xs text-muted">Crear la cuenta no valida tu condición de socio del club. Si el club pide número de socio, te lo preguntamos al comprar.</p>
    </main>
  );
}
