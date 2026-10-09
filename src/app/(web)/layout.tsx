import Link from "next/link";
import { getBrand } from "@/modules/brand";
import { BrandMark } from "@/app/_brand/mark";
import { RevealOnScroll } from "./_ui/reveal";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/propuesta", label: "Propuesta" },
  { href: "/nosotros", label: "Nosotros" },
  { href: "/contacto", label: "Contacto" },
];

/** Web comercial pública de la marca: capta clubes. */
export default async function WebLayout({ children }: { children: React.ReactNode }) {
  const b = await getBrand();
  return (
    <div className="web min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <nav aria-label="Principal" className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="mr-auto" aria-label={`${b.name}, inicio`}>
            <BrandMark size="md" />
          </Link>
          <ul className="hidden items-center gap-6 text-[0.95rem] font-semibold md:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:underline">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/tu-club" className="btn btn-primary btn-sm">
            Tu club
          </Link>
          <details className="relative md:hidden">
            <summary className="btn btn-ghost btn-sm list-none" aria-label="Abrir menú">
              Menú
            </summary>
            <ul className="absolute right-0 mt-2 grid w-48 gap-1 rounded-lg border border-line bg-surface p-2 shadow-lg">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="block rounded px-3 py-2 font-semibold hover:bg-surface-2">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </nav>
      </header>
      <RevealOnScroll />
      {children}
      <footer className="mt-24 border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-[1fr_auto]">
          <div>
            <BrandMark size="lg" />
            {b.tagline && <p className="mt-2 max-w-[48ch] text-muted">{b.tagline}</p>}
          </div>
          <ul className="grid gap-1 text-sm text-muted md:text-right">
            {b.contactEmail && (
              <li>
                <a className="underline" href={`mailto:${b.contactEmail}`}>
                  {b.contactEmail}
                </a>
              </li>
            )}
            {b.whatsapp && (
              <li>
                <a className="underline" href={`https://wa.me/${b.whatsapp.replace(/\D/g, "")}`} rel="noopener" target="_blank">
                  WhatsApp {b.whatsapp}
                </a>
              </li>
            )}
            {b.instagram && <li>Instagram {b.instagram.startsWith("@") ? b.instagram : `@${b.instagram}`}</li>}
            <li>
              <Link className="underline" href="/contacto">
                Pedir una reunión
              </Link>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
