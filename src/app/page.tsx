import Link from "next/link";
import { db } from "@/shared/db";
import { fmtDate } from "@/shared/dates";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const clubs = await db.club.findMany({
    where: { active: true, campaigns: { some: { status: "PUBLISHED", closesAt: { gt: now }, opensAt: { lte: now } } } },
    select: { slug: true, name: true, city: true, logoUrl: true, colorPrimary: true, campaigns: { where: { status: "PUBLISHED", closesAt: { gt: now } }, select: { title: true, closesAt: true }, take: 1 } },
    orderBy: { name: "asc" },
  });
  const name = process.env.PLATFORM_NAME ?? "Camada";
  return (
    <main>
      <section className="relative overflow-hidden bg-brand text-brand-ink">
        <div className="hoops absolute inset-0" style={{ ["--club-2" as string]: "var(--accent)" }} aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-10">
          <div className="flex items-center justify-between">
            <span className="font-display text-2xl font-extrabold uppercase tracking-wider">{name}</span>
            <Link href="/admin" className="text-sm font-semibold underline">Ingresar al panel</Link>
          </div>
          <h1 className="mt-14 max-w-4xl text-6xl font-extrabold md:text-8xl">Indumentaria oficial, fabricada a pedido</h1>
          <p className="mt-6 max-w-[56ch] text-lg opacity-90">
            Cada club tiene su tienda. Socios y familias reservan con una seña, consolidamos los pedidos confirmados y fabricamos solo lo vendido. El club no compra stock ni adelanta dinero.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="eyebrow">Tiendas con preventa abierta</div>
        <h2 className="mb-6 mt-1 text-4xl font-extrabold">Encontrá tu club</h2>
        {clubs.length === 0 ? (
          <p className="card p-6 text-muted">No hay preventas abiertas en este momento.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clubs.map((c) => (
              <li key={c.slug}>
                <Link href={`/club/${c.slug}`} className="card flex items-center gap-4 p-4 hover:border-ink">
                  <span className="grid h-16 w-16 flex-none place-items-center rounded-lg" style={{ background: c.colorPrimary }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.logoUrl && <img src={c.logoUrl} alt="" className="h-12 w-12 object-contain" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-xl font-bold uppercase">{c.name}</span>
                    <span className="block text-sm text-muted">{c.city}</span>
                    {c.campaigns[0] && <span className="block text-sm">{c.campaigns[0].title} · cierra el {fmtDate(c.campaigns[0].closesAt)}</span>}
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
