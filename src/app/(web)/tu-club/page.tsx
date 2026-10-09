import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/shared/db";
import { currentUser } from "@/modules/auth";
import { currentMember } from "@/modules/members";

export const metadata = { title: "Tu club" };

/** Acceso a la plataforma: con sesión iniciada, lleva a la experiencia de cada rol. */
export default async function YourClub() {
  if (await currentUser()) redirect("/admin");
  if (await currentMember()) redirect("/mi-cuenta");
  const clubs = await db.club.findMany({ where: { active: true }, select: { slug: true, name: true, city: true, logoUrl: true, colorPrimary: true, isDemo: true }, orderBy: { name: "asc" } });
  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="text-6xl font-extrabold md:text-7xl">Tu club</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-3xl font-extrabold">Soy socio o familiar</h2>
          <p className="mt-2 text-muted">Entrá a la tienda de tu club para ver la preventa, o a tu cuenta para seguir tus pedidos.</p>
          <Link href="/socios/ingresar" className="btn btn-primary mt-5">
            Ingresar a mi cuenta
          </Link>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-3xl font-extrabold">Soy del club o de la empresa</h2>
          <p className="mt-2 text-muted">Panel de consulta del club y administración de la empresa.</p>
          <Link href="/admin/ingresar" className="btn btn-ghost mt-5">
            Ingresar al panel
          </Link>
        </section>
      </div>
      <section className="mt-14">
        <h2 className="text-3xl font-extrabold">Tiendas de clubes</h2>
        {clubs.length === 0 ? (
          <p className="mt-4 text-muted">Todavía no hay tiendas publicadas.</p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clubs.map((c) => (
              <li key={c.slug}>
                <Link href={`/club/${c.slug}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-ink">
                  <span className="grid h-12 w-12 flex-none place-items-center rounded-lg" style={{ background: c.colorPrimary }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.logoUrl && <img src={c.logoUrl} alt="" className="h-9 w-9 object-contain" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-lg font-bold uppercase">{c.name}</span>
                    <span className="block text-sm text-muted">{c.isDemo ? "Tienda de demostración" : c.city}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
