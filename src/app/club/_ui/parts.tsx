import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/shared/dates";
import { BrandMark } from "@/shared/ui/brand";

export function ClubBar({ club, href }: { club: { name: string; logoUrl: string | null; city: string | null; venue: string | null; slug: string }; href?: string }) {
  return (
    <Link href={href ?? `/club/${club.slug}`} className="flex items-center gap-3">
      {club.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={club.logoUrl} alt={`Escudo de ${club.name}`} className="h-14 w-12 object-contain" />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-club-2 font-display text-xl font-extrabold text-on-club-2">{club.name.slice(0, 1)}</span>
      )}
      <span className="leading-tight">
        <span className="block font-display text-lg font-bold uppercase tracking-wider">{club.name}</span>
        <span className="block text-sm opacity-80">{[club.venue, club.city].filter(Boolean).join(" · ")}</span>
      </span>
    </Link>
  );
}

export function Steps({ deposit, advance }: { deposit: boolean; advance?: boolean }) {
  const steps = advance
    ? [
        ["Configurás", "Producto, talle, jugador y personalización. Podés comprar para varios hijos en un solo pedido."],
        ["Anticipás", "Pagás el anticipo con Mercado Pago. El pedido se confirma al acreditarse."],
        ["Fabricamos", "Al cierre se consolida la orden y se produce solo lo que se pidió."],
        ["Llega al club", "La producción completa se entrega en el club. Si hay saldo, se paga al club."],
        ["Retirás", "En la sede, con tu código de retiro, en los horarios publicados."],
      ]
    : deposit
    ? [
        ["Elegís", "Prendas, talles y el jugador de cada una. Podés comprar para varios hijos en un solo pedido."],
        ["Reservás", "Pagás la seña con Mercado Pago o transferencia. El pedido se confirma al acreditarse."],
        ["Fabricamos", "Al cierre se consolida la orden y se produce solo lo que se pidió."],
        ["Completás", "Te avisamos cuando las prendas llegan al club y pagás el saldo."],
        ["Retirás", "En la sede, con tu código de retiro, en los horarios publicados."],
      ]
    : [
        ["Elegís", "Prendas, talles y el jugador de cada una. Podés comprar para varios hijos en un solo pedido."],
        ["Pagás", "El total con Mercado Pago o transferencia. El pedido se confirma al acreditarse."],
        ["Fabricamos", "Al cierre se consolida la orden y se produce solo lo que se pidió."],
        ["Retirás", "Te avisamos cuando las prendas llegan al club y retirás con tu código."],
      ];
  return (
    <ol className="grid gap-5 border-l-[3px] border-club pl-5 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))] md:gap-0 md:border-l-0 md:border-t-[3px] md:pl-0">
      {steps.map(([t, d], i) => (
        <li key={t} className="relative md:pr-4 md:pt-4">
          <span aria-hidden className={`absolute -left-[30px] top-1 h-4 w-4 rounded-full border-[3px] border-club md:-top-[10px] md:left-0 ${i < 2 ? "bg-club-2 border-club-2" : "bg-paper"}`} />
          <div className="eyebrow">Paso {i + 1}</div>
          <h3 className="mt-1 text-2xl font-bold">{t}</h3>
          <p className="mt-1 max-w-[30ch] text-sm text-muted">{d}</p>
        </li>
      ))}
    </ol>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-x-8 md:grid-cols-2">
      {items.map((f) => (
        <details key={f.q} className="group border-b border-line py-3">
          <summary className="flex cursor-pointer list-none justify-between gap-3 font-bold">
            {f.q}
            <span aria-hidden className="font-display text-xl text-club group-open:rotate-45">+</span>
          </summary>
          <p className="mt-2 max-w-[60ch] text-muted">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function waLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export function Contact({ club, message }: { club: { name: string; whatsapp: string | null; email: string | null; instagram: string | null; facebook: string | null; website: string | null; officeHours: string | null }; message: string }) {
  return (
    <div className="card flex flex-wrap items-center gap-x-10 gap-y-4 p-5">
      {club.whatsapp && (
        <div>
          <div className="eyebrow">WhatsApp</div>
          <a className="font-semibold underline" href={waLink(club.whatsapp, message)} target="_blank" rel="noopener noreferrer">
            Escribir al club
          </a>
        </div>
      )}
      {club.email && (
        <div>
          <div className="eyebrow">Correo</div>
          <span className="select-all font-semibold">{club.email}</span>
        </div>
      )}
      {club.instagram && (
        <div>
          <div className="eyebrow">Instagram</div>
          <a className="font-semibold underline" href={`https://instagram.com/${club.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
            @{club.instagram.replace(/^@/, "")}
          </a>
        </div>
      )}
      {club.officeHours && (
        <div>
          <div className="eyebrow">Atención</div>
          <span className="font-semibold">{club.officeHours}</span>
        </div>
      )}
      <div>
        <div className="eyebrow">¿Ya compraste?</div>
        <Link href="/pedido/recuperar" className="font-semibold underline">Recuperar el enlace de mi pedido</Link>
      </div>
    </div>
  );
}

export function WindowLine({ c, open }: { c: { status: string; opensAt: Date; closesAt: Date }; open: boolean }) {
  const now = new Date();
  if (open) return <>Preventa abierta hasta el {fmtDateTime(c.closesAt)}</>;
  if (c.status === "PUBLISHED" && c.opensAt > now) return <>La preventa abre el {fmtDateTime(c.opensAt)}</>;
  if (c.status === "CANCELLED") return <>Campaña cancelada</>;
  return <>Ventana cerrada el {fmtDate(c.closesAt)}. No se aceptan nuevas compras.</>;
}

/** Aviso visible en clubes de demostración: no hay ventas reales ni respaldo del club. */
export function DemoBanner() {
  return (
    <div role="note" className="bg-ink px-4 py-2 text-center text-sm font-semibold text-paper">
      DEMOSTRACIÓN · Bocetos de Walkersport con precios de ejemplo. No es una tienda oficial del club ni una venta real; los pagos son simulados.
    </div>
  );
}

export function PlatformFooter({ name, brandLine, demo }: { name: string; brandLine?: string | null; demo?: boolean }) {
  return (
    <footer className="mt-16 border-t border-line py-6 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4">
        <span>{demo ? `Demostración para ${name}` : `Tienda oficial de ${name}`}{brandLine ? ` · ${brandLine}` : ""}</span>
        <span className="inline-flex items-center gap-2">Fabricación y gestión: <BrandMark className="h-5" /> {process.env.PLATFORM_NAME ?? "Walkersport"}</span>
      </div>
    </footer>
  );
}
