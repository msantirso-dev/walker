import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getClubStore, clubTheme } from "@/modules/clubs/public";
import { CAMPAIGN_STATUS_LABEL, effectiveStatus } from "@/modules/campaigns";
import { fmtDate, fmtDateTime } from "@/shared/dates";
import { ClubBar, Contact, Faq, PlatformFooter, Steps } from "../_ui/parts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ club: string }> }): Promise<Metadata> {
  const data = await getClubStore((await params).club);
  return data ? { title: `Tienda oficial · ${data.club.name}`, description: data.club.description ?? undefined } : {};
}

export default async function ClubPage({ params }: { params: Promise<{ club: string }> }) {
  const data = await getClubStore((await params).club);
  if (!data) notFound();
  const { club, current, history } = data;
  const faq = (current?.faq as { q: string; a: string }[] | null) ?? [];

  return (
    <div style={clubTheme(club)}>
      <header className="relative overflow-hidden bg-club text-on-club">
        {club.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        )}
        <div className="hoops pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-6">
          <ClubBar club={club} />
          <div className="mt-10 max-w-3xl">
            <div className="font-display text-sm font-bold uppercase tracking-[0.14em] opacity-85">Tienda oficial</div>
            <h1 className="mt-2 text-5xl font-extrabold md:text-7xl">{club.name}</h1>
            {club.description && <p className="mt-4 max-w-[52ch] text-lg opacity-90">{club.description}</p>}
            {club.sports.length > 0 && <p className="mt-3 text-sm font-semibold opacity-80">{club.sports.map((s) => s.sport.name).join(" · ")}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="mt-10">
          {current ? (
            <div className="card grid gap-6 overflow-hidden p-0 md:grid-cols-[1.4fr_1fr]">
              <div className="p-6">
                <div className="eyebrow">Preventa vigente</div>
                <h2 className="mt-1 text-4xl font-extrabold">{current.title}</h2>
                {current.description && <p className="mt-3 max-w-[56ch] text-muted">{current.description}</p>}
                <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
                  <div><dt className="text-sm text-muted">Cierre</dt><dd className="font-display text-2xl font-bold">{fmtDateTime(current.closesAt)}</dd></div>
                  <div><dt className="text-sm text-muted">Entrega estimada</dt><dd className="font-display text-2xl font-bold">{current.deliveryDaysMin} a {current.deliveryDaysMax} días del cierre</dd></div>
                </dl>
                <Link href={`/club/${club.slug}/${current.slug}`} className="btn btn-club mt-6">
                  Ver la colección y comprar
                </Link>
              </div>
              <div className="relative hidden bg-club md:block">
                <div className="hoops absolute inset-0" aria-hidden />
                <div className="absolute inset-0 grid place-items-center font-display text-[9rem] font-extrabold leading-none text-on-club opacity-25">{current.season ?? ""}</div>
              </div>
            </div>
          ) : (
            <div className="card p-6">
              <div className="eyebrow">Sin preventa abierta</div>
              <p className="mt-2 text-lg">No hay una preventa abierta en este momento. Cuando abra la próxima ventana, la vas a encontrar acá.</p>
            </div>
          )}
        </section>

        <section className="mt-14">
          <div className="eyebrow">Cómo funciona</div>
          <h2 className="mb-6 mt-1 text-4xl font-extrabold">De la reserva al retiro</h2>
          <Steps deposit={current ? current.paymentMode === "DEPOSIT" : true} />
        </section>

        <section className="mt-14 grid gap-6 md:grid-cols-2">
          <div className="card p-5">
            <div className="eyebrow">Retiro</div>
            <p className="mt-2 font-semibold">{club.pickupAddress ?? "A confirmar"}</p>
            {club.pickupHours && <p className="mt-1 text-muted">{club.pickupHours}</p>}
          </div>
          {club.conditions && (
            <div className="card p-5">
              <div className="eyebrow">Condiciones del club</div>
              <p className="mt-2 text-muted">{club.conditions}</p>
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section className="mt-14">
            <div className="eyebrow">Historial</div>
            <h2 className="mb-4 mt-1 text-3xl font-extrabold">Campañas anteriores</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {history.map((c) => {
                const st = effectiveStatus(c);
                const body = (
                  <div className="card flex items-center justify-between gap-4 p-4">
                    <div>
                      <div className="font-display text-xl font-bold uppercase">{c.title}</div>
                      <div className="text-sm text-muted">Cerró el {fmtDate(c.closesAt)}</div>
                    </div>
                    <span className="badge badge-muted">{st === "SCHEDULED" ? "Próximamente" : CAMPAIGN_STATUS_LABEL[st]}</span>
                  </div>
                );
                return <li key={c.id}>{c.showCatalogWhenClosed ? <Link href={`/club/${club.slug}/${c.slug}`}>{body}</Link> : body}</li>;
              })}
            </ul>
          </section>
        )}

        {faq.length > 0 && (
          <section className="mt-14">
            <div className="eyebrow">Preguntas frecuentes</div>
            <h2 className="mb-4 mt-1 text-3xl font-extrabold">Antes de comprar</h2>
            <Faq items={faq} />
          </section>
        )}

        <section className="mt-14">
          <Contact club={club} message={`Hola, tengo una consulta sobre la tienda de ${club.name}.`} />
        </section>
      </main>
      <PlatformFooter name={club.name} />
    </div>
  );
}
