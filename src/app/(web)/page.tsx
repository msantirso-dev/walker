import Link from "next/link";
import { getBrand } from "@/modules/brand";
import { JerseyBack } from "./_ui/jersey";
import { ContactForm } from "./_ui/contact-form";
import { FAQ, SIZE_CURVE, STEPS } from "./_content";

export default async function Home() {
  const b = await getBrand();
  const brand = b.name;
  return (
    <main>
      {/* 1. Identidad y propuesta principal */}
      <section className="overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 md:grid-cols-[1.15fr_1fr] md:pb-20 md:pt-16">
          <div>
            <h1 className="text-6xl font-extrabold md:text-8xl">La marca de tu club, en la espalda de cada socio</h1>
            <p className="mt-6 max-w-[54ch] text-lg text-muted">
              {brand} abre una tienda de preventa para tu club. Los socios eligen sus prendas y pagan un anticipo online; al cierre fabricamos lo vendido y entregamos todo junto en la sede.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contacto" className="btn btn-primary">
                Pedir una reunión
              </Link>
              <a href="#como-funciona" className="btn btn-ghost">
                Ver cómo funciona
              </a>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[420px]">
            <div className="absolute inset-x-6 bottom-0 top-10 -z-10 rounded-[40%] bg-accent/25 blur-3xl" aria-hidden />
            <JerseyBack name={brand} number="26" className="w-full drop-shadow-xl" />
          </div>
        </div>
      </section>

      {/* 2. Cómo funciona */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20" data-reveal>
        <h2 className="text-5xl font-extrabold md:text-6xl">Cómo funciona la preventa</h2>
        <p className="mt-3 max-w-[60ch] text-muted">Cada club tiene su tienda con su escudo y sus colores. Nadie compra stock a ciegas: se fabrica lo que se vendió en cada ventana de preventa.</p>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="bg-surface p-5">
              <span className="font-display text-5xl font-extrabold text-accent" aria-hidden>
                {i + 1}
              </span>
              <h3 className="mt-2 text-2xl font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.text(brand)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 3. Beneficios */}
      <section className="bg-brand text-brand-ink" data-reveal>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2">
          <div>
            <h2 className="text-5xl font-extrabold md:text-6xl">Lo que gana el club</h2>
            <p className="mt-5 max-w-[50ch] text-lg opacity-90">
              Convertí la preventa en una oportunidad para tu club: generá ingresos, reinvertilos en prendas adicionales y desarrollá tu boutique con demanda ya identificada.
            </p>
            <Link href="/propuesta#simulador" className="btn mt-8 bg-accent text-accent-ink hover:opacity-90">
              Probar el simulador
            </Link>
          </div>
          <dl className="grid gap-6 sm:grid-cols-2">
            {[
              ["Ingreso por cada venta", `El precio al socio lo acuerda el club. La diferencia con el precio ${brand}, descontadas las deducciones que se definan, la cobra el club directamente a sus socios.`],
              ["Sin cobrar online", `El anticipo se paga por Mercado Pago a ${brand}. El club no administra pasarelas de pago ni una tienda.`],
              ["Pedidos ordenados", "Cada prenda queda asociada a un comprador, un jugador, un deporte y una categoría. El club consulta todo y lo exporta a Excel."],
              ["Stock con demanda real", "Se fabrica lo vendido. Las compras iniciales y los mínimos por producto se acuerdan antes de empezar."],
            ].map(([t, d]) => (
              <div key={t} className="border-t border-current/25 pt-4">
                <dt className="font-display text-2xl font-bold uppercase">{t}</dt>
                <dd className="mt-1 opacity-85">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 4. Identidad propia y catálogo */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-[1fr_1.1fr]" data-reveal>
        <div>
          <h2 className="text-5xl font-extrabold md:text-6xl">Una identidad propia, no una marca prestada</h2>
          <p className="mt-5 max-w-[56ch] text-muted">
            Desarrollamos la línea del club con su escudo, sus colores y su nombre: «Tu club by {brand}». La identidad es del club. Si algún día decide no seguir, conserva su marca.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            ["Hasta 48 artículos", "Camisetas, shorts, buzos, camperas, bolsos y accesorios dentro del catálogo que podemos fabricar."],
            ["10 a 15 bocetos para empezar", "El club recibe una primera propuesta y suma artículos cuando los necesita."],
            ["Leyenda de disciplina", "El mismo artículo para todo el club, con la inscripción de cada deporte."],
            ["Nombre y número", "Personalización por prenda, para varios jugadores en un mismo pedido."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-2xl font-bold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Muestrario de talles */}
      <section className="border-y border-line bg-surface" data-reveal>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2">
          <div>
            <h2 className="text-5xl font-extrabold md:text-6xl">Probarse antes de comprar</h2>
            <p className="mt-5 max-w-[54ch] text-muted">
              El club recibe una curva de remera y una de short como referencia para las prendas superiores e inferiores. Los socios se prueban el talle en la sede y después compran online. Cada producto publica su tabla de medidas.
            </p>
            <p className="mt-3 max-w-[54ch] text-muted">Los talles infantiles abarcan dos edades cada uno: la prenda dura más y el muestrario es más chico.</p>
          </div>
          <div>
            <ul className="flex flex-wrap gap-2" aria-label="Curva de talles">
              {SIZE_CURVE.map((s) => (
                <li key={s.label} className="grid min-w-16 place-items-center rounded-lg border-2 border-brand px-3 py-2 text-center">
                  <span className="font-display text-2xl font-extrabold">{s.label}</span>
                  {s.hint && <span className="text-xs text-muted">{s.hint}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">Infantiles 1, 2 y 3 · adultos S a 5XL. Las equivalencias de calce entre productos las aprueba {brand} producto por producto.</p>
          </div>
        </div>
      </section>

      {/* 6. Activación de campañas */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2" data-reveal>
        <div>
          <h2 className="text-5xl font-extrabold md:text-6xl">Cada producto se activa cuando conviene</h2>
          <p className="mt-5 max-w-[54ch] text-muted">
            Las preventas se abren por producto, por deporte y por categoría: la camiseta de juego para el M15 de rugby, el buzo para todo el club, la pollera para hockey. Cada una tiene fecha y hora de cierre, con cuenta regresiva en la tienda.
          </p>
          <p className="mt-3 max-w-[54ch] text-muted">Los productos que todavía no están en preventa se ven en la tienda como «Próximamente».</p>
        </div>
        <div className="grid gap-3" aria-hidden>
          {[
            ["Camiseta de juego", "Rugby · M15", "Cierra en 6 días"],
            ["Buzo de salida", "Todo el club", "Cierra en 12 días"],
            ["Pollera", "Hockey · Primera", "Próximamente"],
          ].map(([p, a, s]) => (
            <div key={p} className={`flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 ${s === "Próximamente" ? "opacity-60" : ""}`}>
              <div>
                <div className="font-display text-xl font-bold uppercase">{p}</div>
                <div className="text-sm text-muted">{a}</div>
              </div>
              <span className={`badge ${s === "Próximamente" ? "badge-muted" : "badge-ok"}`}>{s}</span>
            </div>
          ))}
          <p className="text-xs text-muted">Ejemplo de cómo se ve en la tienda.</p>
        </div>
      </section>

      {/* 7. Fabricación y entrega consolidada */}
      <section className="border-y border-line bg-surface" data-reveal>
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-5xl font-extrabold md:text-6xl">Fabricación y entrega en el club</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {[
              ["Cierre de la preventa", "La fecha y hora del servidor deciden el cierre. Ahí empieza la producción."],
              ["Producción", "Plazo estimado de 30 a 45 días desde el cierre. Si el inicio real se corre, se informa."],
              ["Entrega consolidada", "Toda la producción llega junta a la sede, con remito y lista por comprador y jugador."],
              ["Retiro en el club", "El club entrega a cada socio contra el pago del saldo, que se paga solo al club."],
            ].map(([t, d], i) => (
              <li key={t} className="border-l-4 border-accent pl-4">
                <span className="text-sm font-semibold text-muted">Paso {i + 1}</span>
                <h3 className="mt-1 text-2xl font-bold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 8. Preguntas frecuentes */}
      <section className="mx-auto max-w-3xl px-4 py-20" data-reveal>
        <h2 className="text-5xl font-extrabold md:text-6xl">Preguntas frecuentes</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {FAQ(brand).map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                {f.q}
                <span className="text-2xl transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 max-w-[66ch] text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 9. Contacto */}
      <section id="contacto" className="scroll-mt-20" data-reveal>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-5xl font-extrabold md:text-6xl">Hablemos de tu club</h2>
            <p className="mt-5 max-w-[46ch] text-muted">Contanos qué disciplinas tiene el club y qué prendas les interesan. Coordinamos una reunión para mostrarte la tienda y armar la propuesta.</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}
