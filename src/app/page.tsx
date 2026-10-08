import Link from "next/link";
import { db } from "@/shared/db";
import { fmtDate } from "@/shared/dates";
import { BrandMark } from "@/shared/ui/brand";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const clubs = await db.club.findMany({
    where: { active: true, campaigns: { some: { status: "PUBLISHED", closesAt: { gt: now }, opensAt: { lte: now } } } },
    select: { slug: true, name: true, city: true, logoUrl: true, colorPrimary: true, campaigns: { where: { status: "PUBLISHED", closesAt: { gt: now } }, select: { title: true, closesAt: true }, take: 1 } },
    orderBy: { name: "asc" },
  });
  const name = process.env.PLATFORM_NAME ?? "Walkersport";
  return (
    <main>
      <section className="relative overflow-hidden bg-brand text-brand-ink">
        <div className="hoops absolute inset-0" style={{ ["--club-2" as string]: "var(--accent)" }} aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-10">
          <div className="flex items-center justify-between">
            <BrandMark className="h-12" title={name} />
            <Link href="/admin" className="text-sm font-semibold underline">Ingresar al panel</Link>
          </div>
          <div className="eyebrow mt-14 opacity-80">Tu equipo · la mejor indumentaria</div>
          <h1 className="mt-2 max-w-4xl text-6xl font-extrabold md:text-8xl">La marca de tu club, fabricada a pedido</h1>
          <p className="mt-6 max-w-[56ch] text-lg opacity-90">
            Cada club tiene su tienda de preventa. Socios y familias pagan un anticipo con Mercado Pago y el saldo al club; fabricamos lo vendido y entregamos todo junto en la sede.
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
      <footer className="border-t border-line py-6 text-sm text-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
          <BrandMark className="h-6" title={name} />
          <span>Instagram @walkersport · WhatsApp 11 3610 0004</span>
        </div>
      </footer>
    </main>
  );
}
