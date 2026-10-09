import Link from "next/link";
import { getBrand } from "@/modules/brand";
import { advanceUnit, DEFAULT_CLUB_TAX_BP } from "@/shared/advance";
import { ars } from "@/shared/money";
import { Simulator } from "../_ui/simulator";

export const metadata = { title: "Propuesta" };

export default async function Proposal() {
  const b = await getBrand();
  const ex = advanceUnit({ textil: 1_000_000, price: 1_300_000, extrasTextil: 0, taxBp: DEFAULT_CLUB_TAX_BP });
  const rows: [string, string, string][] = [
    [`Precio ${b.name} (B)`, ars(1_000_000), `Lo fija ${b.name}.`],
    ["Precio final al socio (P)", ars(1_300_000), "Lo acuerda el club; nunca menor que B."],
    ["Diferencia del club (G = P − B)", ars(ex.margin), "La rentabilidad que acuerda el club."],
    ["Deducciones sobre G (D)", ars(ex.tax), "21 % + 3,5 % de G, a confirmar."],
    ["Anticipo online (A = B + D)", ars(ex.advance), `Lo paga el socio con Mercado Pago a ${b.name}.`],
    ["Saldo al club (S = P − A)", ars(ex.club), "Lo paga el socio al club, al retirar."],
  ];
  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-6xl font-extrabold md:text-7xl">La propuesta para tu club</h1>
      <p className="mt-5 max-w-[62ch] text-lg text-muted">
        Una tienda de preventa propia, una marca de indumentaria del club y la fabricación a cargo de {b.name}. El club define su rentabilidad; {b.name} carga los precios, cobra el anticipo, fabrica y entrega.
      </p>

      <section className="mt-16" data-reveal>
        <h2 className="text-4xl font-extrabold md:text-5xl">Cómo se compone cada venta</h2>
        <p className="mt-3 max-w-[62ch] text-muted">
          Ejemplo con un precio {b.name} de $10.000 y un precio al socio de $13.000. El socio ve solo el anticipo y el saldo; el detalle es para el club.
        </p>
        <div className="tbl-wrap mt-6 rounded-xl border border-line bg-surface">
          <table className="tbl">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="text-right">Importe</th>
                <th>Quién lo define o cobra</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([c, v, n]) => (
                <tr key={c}>
                  <td className="font-semibold">{c}</td>
                  <td className="num text-right">{v}</td>
                  <td className="text-muted">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="notice notice-warn mt-4 max-w-[80ch]">
          <b>Composición del anticipo pendiente de confirmación.</b> Falta definir si ambos porcentajes se aplican sobre la diferencia del club, si se suman o tienen bases distintas, si están incluidos en el precio final, a quién corresponde la deducción y cómo se documenta. Hasta entonces el ejemplo es ilustrativo.
        </p>
        <p className="mt-4 max-w-[70ch] text-sm text-muted">
          Las cuotas y su costo financiero son los que ofrece Mercado Pago al pagar y corren por cuenta del comprador. La comisión de procesamiento del cobro es un costo de {b.name}: no se traslada al club ni al socio.
        </p>
      </section>

      <section id="simulador" className="mt-20 scroll-mt-20" data-reveal>
        <h2 className="text-4xl font-extrabold md:text-5xl">Simulador para el club</h2>
        <p className="mt-3 max-w-[62ch] text-muted">Probá con tus números cuánto podría cobrar el club en una preventa y cuántas prendas adicionales alcanzaría a comprar para su boutique.</p>
        <div className="mt-8">
          <Simulator brand={b.name} defaultDeductionPct={DEFAULT_CLUB_TAX_BP / 100} />
        </div>
      </section>

      <section className="mt-20" data-reveal>
        <h2 className="text-4xl font-extrabold md:text-5xl">Lo que se acuerda antes de empezar</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["Acuerdo anual", "Exclusividad, catálogo, muestrario y condiciones de activación, en un acuerdo privado entre el club y la empresa."],
            ["Mínimos por producto", "Prendas de juego por categoría completa; prendas de salida con un mínimo de producción, donde el club compra la diferencia."],
            ["Compras del club", "Después del cierre, el club puede sumar unidades para ventas fuera de término, su boutique o cambios de talle. Se pagan hasta la entrega."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-2xl font-bold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ul>
        <Link href="/contacto" className="btn btn-primary mt-10">
          Pedir una reunión
        </Link>
      </section>
    </main>
  );
}
