import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCampaignStore, clubTheme } from "@/modules/clubs/public";
import { fmtDate } from "@/shared/dates";
import { ars } from "@/shared/money";
import { Bar } from "@/shared/ui";
import { ClubBar, Contact, DemoBanner, Faq, PlatformFooter, Steps, WindowLine } from "../../_ui/parts";
import { CHANGE_POLICY_TEXT, CHANGE_POLICY_UNPERSONALIZED } from "@/modules/catalog/options";
import { MP_FINANCING_TEXT, SAMPLE_TEXT } from "@/shared/copy";
import { StoreApp, type StoreConfig } from "./store-app";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ club: string; campaign: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { club, campaign } = await params;
  const d = await getCampaignStore(club, campaign);
  return d ? { title: `${d.campaign.title} · ${d.club.name}`, description: d.campaign.description ?? undefined } : {};
}

export default async function CampaignPage({ params }: P) {
  const { club: clubSlug, campaign: campaignSlug } = await params;
  const d = await getCampaignStore(clubSlug, campaignSlug);
  if (!d) notFound();
  const { club, campaign: c, open, products, payments } = d;
  const showCatalog = open || c.showCatalogWhenClosed || (c.status === "PUBLISHED" && c.opensAt > new Date());
  const advance = c.pricingModel === "TEXTIL_ADVANCE";
  const deposit = c.paymentMode === "DEPOSIT";
  const depositText = advance ? "Anticipo" : !deposit ? "Pago total" : c.depositType === "PERCENT" ? `${c.depositValue} %` : ars(c.depositValue);
  const anyPersonalized = products.some((p) => p.optionGroups.some((g) => g.blocksSizeChange));
  const audSports = c.audience === "SPORTS" ? c.audienceSports.map((s) => s.name) : club.sports.map((s) => s.sport.name);
  const audCats =
    c.audience === "CATEGORIES"
      ? c.audienceCategories.map((x) => ({ name: x.name, sport: x.sport?.name ?? null }))
      : club.categories.filter((x) => c.audience !== "SPORTS" || !x.sport || audSports.includes(x.sport.name)).map((x) => ({ name: x.name, sport: x.sport?.name ?? null }));
  const faq = (c.faq as { q: string; a: string }[] | null) ?? [];
  const hero = products[0]?.images[0];

  const cfg: StoreConfig = {
    campaignId: c.id,
    open,
    model: c.pricingModel,
    paymentMode: c.paymentMode,
    depositType: c.depositType,
    depositValue: c.depositType === "FIXED" ? c.depositValue : c.depositValue,
    pickupEnabled: c.pickupEnabled,
    pickupText: [club.pickupAddress, club.pickupHours].filter(Boolean).join(". ") || null,
    shippingEnabled: c.shippingEnabled,
    shippingPrice: c.shippingPrice,
    shippingNotes: c.shippingNotes,
    memberNumberMode: c.memberNumberMode,
    mercadopago: payments.mercadopago,
    simulated: payments.simulated,
    transfer: payments.transfer,
    receiver: payments.receiver,
    clubName: club.name,
    sports: audSports,
    categories: audCats,
    audience: c.audience,
    audienceText: d.audience,
    demo: club.isDemo,
    policiesAnchor: "#condiciones",
  };

  return (
    <div style={clubTheme(club)} className={open ? "pb-24" : ""}>
      {club.isDemo && <DemoBanner />}
      <header className="relative overflow-hidden bg-club text-on-club">
        <div className="hoops pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-6 px-4 pb-10 pt-6 md:grid-cols-[1.25fr_1fr]">
          <div>
            <ClubBar club={club} />
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-current/30 bg-white/10 px-3 py-1 text-sm font-semibold">
              <span aria-hidden className={`h-2 w-2 rounded-full ${open ? "bg-club-2" : "bg-current opacity-60"}`} />
              <WindowLine c={c} open={open} />
            </p>
            <h1 className="mt-4 text-5xl font-extrabold md:text-7xl">{c.title}</h1>
            {c.description && <p className="mt-4 max-w-[46ch] text-lg opacity-90">{c.description}</p>}
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
              <div><dt className="text-sm opacity-80">Cierre</dt><dd className="font-display text-2xl font-bold uppercase">{fmtDate(c.closesAt)}</dd></div>
              <div><dt className="text-sm opacity-80">Entrega estimada</dt><dd className="font-display text-2xl font-bold">{c.deliveryDaysMin} a {c.deliveryDaysMax} días del cierre</dd></div>
              <div><dt className="text-sm opacity-80">{advance ? "Entrega" : "Para reservar"}</dt><dd className="font-display text-2xl font-bold">{advance ? "En el club" : depositText}</dd></div>
            </dl>
          </div>
          {hero && (
            <div className="relative mx-auto w-full max-w-sm">
              {c.season && <div aria-hidden className="absolute inset-0 grid place-items-center font-display text-[10rem] font-extrabold leading-none opacity-20">{c.season.slice(-2)}</div>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.url} alt={hero.alt ?? ""} className="relative aspect-square w-full rounded-2xl object-cover shadow-2xl" />
              <span className="tag-photo">{hero.tag === "REAL" ? "Foto real" : hero.tag === "DESIGN" ? "Diseño" : "Referencia"}</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="mt-12">
          <div className="eyebrow">Cómo funciona</div>
          <h2 className="mb-6 mt-1 text-4xl font-extrabold">{advance ? "Configurás, anticipás, fabricamos y retirás en el club" : deposit ? "Elegís, reservás, fabricamos, completás y retirás" : "Elegís, pagás, fabricamos y retirás"}</h2>
          <Steps deposit={deposit} advance={advance} />
        </section>

        {c.minUnits ? (
          <section className="card mt-10 grid gap-3 p-5 md:grid-cols-[1fr_1.4fr] md:items-center">
            <div>
              <div className="eyebrow">Mínimo de producción</div>
              <p className="mt-1 font-display text-3xl font-bold">
                {d.confirmedUnits} de {c.minUnits} prendas confirmadas
              </p>
            </div>
            <div>
              <Bar value={d.confirmedUnits} max={c.minUnits} label="Avance hacia el mínimo de producción" />
              <p className="mt-2 text-sm text-muted">
                Contamos solo prendas de pedidos con seña, anticipo o pago acreditado. {c.minPolicyText}
              </p>
            </div>
          </section>
        ) : null}

        {products.some((p) => p.samples.length > 0) && (
          <section className="notice notice-info mt-10">
            <b>{SAMPLE_TEXT}</b>{" "}
            {[...new Set(products.flatMap((p) => p.samples.map((x) => x.location)).filter(Boolean))].join(" · ")}
          </section>
        )}

        {showCatalog ? (
          <StoreApp products={products} cfg={cfg} />
        ) : (
          <section className="card mt-12 p-6">
            <p className="text-lg">La ventana de compra de esta campaña está cerrada.</p>
          </section>
        )}

        <section id="condiciones" className="mt-16 scroll-mt-4">
          <div className="eyebrow">Condiciones de la preventa</div>
          <h2 className="mb-5 mt-1 text-3xl font-extrabold">Lo que aceptás al comprar</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Pagos", advance
                ? `Para confirmar el pedido pagás el anticipo con Mercado Pago; lo cobra ${payments.receiver}. Si el precio al socio es mayor que el anticipo, la diferencia es un saldo que pagás directamente a ${club.name}, antes del retiro. ${MP_FINANCING_TEXT}`
                : `${deposit ? `Seña de ${depositText} para confirmar; el saldo ${c.balanceDueText ?? "se paga antes del retiro"}` : "Pago total al comprar"}. Los pagos se acreditan a: ${payments.receiver}. Un comprobante cargado queda en revisión hasta su aprobación.`],
              ["Fabricación y entrega", `Se fabrica solo lo pedido en la ventana. Entrega estimada entre ${c.deliveryDaysMin} y ${c.deliveryDaysMax} días desde el cierre.${advance ? ` La producción completa se entrega en ${club.name}; no hay envío a domicilio.` : ""}${(advance || c.pickupEnabled) && club.pickupAddress ? ` Retiro en ${club.pickupAddress}.` : ""}`],
              ["Cambios", [anyPersonalized ? `${CHANGE_POLICY_TEXT} ${CHANGE_POLICY_UNPERSONALIZED}` : null, c.policyChanges].filter(Boolean).join(" ") || null],
              ["Cancelación", c.policyCancellation],
              ["Devoluciones", c.policyRefunds],
              ["Mínimo de producción", c.minPolicyText],
              ["Condiciones del club", club.conditions],
              ["Privacidad", "Usamos tus datos solo para gestionar el pedido, la producción y la entrega. No pedimos DNI ni fecha de nacimiento. No guardamos datos de tarjetas."],
            ]
              .filter(([, v]) => v)
              .map(([t, v]) => (
                <div key={t} className="card p-4">
                  <h3 className="text-xl font-bold">{t}</h3>
                  <p className="mt-1 text-sm text-muted">{v}</p>
                </div>
              ))}
          </div>
        </section>

        {faq.length > 0 && (
          <section className="mt-14">
            <div className="eyebrow">Preguntas frecuentes</div>
            <h2 className="mb-4 mt-1 text-3xl font-extrabold">Antes de comprar</h2>
            <Faq items={faq} />
          </section>
        )}

        <section className="mt-14">
          <Contact club={club} message={`Hola, tengo una consulta sobre la preventa "${c.title}".`} />
        </section>
      </main>
      <PlatformFooter name={club.name} brandLine={d.brandLine} demo={club.isDemo} />
    </div>
  );
}
