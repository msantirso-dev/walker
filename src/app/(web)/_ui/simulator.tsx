"use client";
import { useId, useState } from "react";

const ars = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Simulador ilustrativo para clubes. Muestra sus supuestos y distingue ingreso, stock comprado,
 * facturación posterior y beneficio (que no calcula: depende de costos que el simulador no conoce).
 */
export function Simulator({ brand, defaultDeductionPct }: { brand: string; defaultDeductionPct: number }) {
  const [b, setB] = useState("10000");
  const [p, setP] = useState("13000");
  const [units, setUnits] = useState("30");
  const [ded, setDed] = useState(String(defaultDeductionPct).replace(".", ","));
  const [extra, setExtra] = useState("10000");
  const id = useId();

  const B = num(b), P = num(p), U = Math.floor(num(units)), Dp = num(ded), X = num(extra);
  const G = P - B;
  const invalid = P < B ? "El precio final no puede ser menor que el precio " + brand + "." : X <= 0 ? "Indicá el precio de compra de las unidades adicionales." : null;
  const D = Math.round(G * Dp) / 100; // deducción por unidad
  const S = G - D; // saldo que cobra el club por unidad
  const income = Math.max(0, S * U);
  const fundable = invalid ? 0 : Math.floor(income / X);
  const stock = fundable * X;

  const field = (key: string, label: string, value: string, set: (v: string) => void, hint?: string, suffix?: string) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <div className="flex items-center gap-2">
        <input id={`${id}-${key}`} className="input num" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
        {suffix && <span className="text-sm text-muted">{suffix}</span>}
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} aria-label="Datos de la simulación">
        {field("b", `Precio ${brand} por prenda`, b, setB, undefined, "$")}
        {field("p", "Precio final al socio", p, setP, "Lo acuerda el club; nunca menor al precio " + brand + ".", "$")}
        {field("u", "Prendas vendidas en la preventa", units, setUnits)}
        {field("d", "Deducciones sobre la diferencia del club", ded, setDed, "Hipótesis 21 % + 3,5 %, pendiente de confirmación.", "%")}
        <div className="sm:col-span-2">{field("x", "Precio de compra de cada unidad adicional", extra, setExtra, "Lo que pagaría el club por cada prenda extra para su boutique.", "$")}</div>
      </form>

      <div className="rounded-2xl bg-brand p-5 text-brand-ink md:p-7" aria-live="polite">
        {invalid ? (
          <p role="alert" className="font-semibold">{invalid}</p>
        ) : (
          <>
            <p className="text-sm opacity-80">Con estos supuestos, el club cobra a sus socios</p>
            <p className="font-display text-5xl font-extrabold md:text-6xl">{ars(income)}</p>
            <p className="mt-1 text-sm opacity-80">
              {U} prendas × {ars(S)} de saldo por prenda ({ars(G)} de diferencia − {ars(D)} de deducciones)
            </p>
            <div className="mt-6 grid gap-4 border-t border-current/20 pt-5 sm:grid-cols-2">
              <div>
                <p className="font-display text-4xl font-extrabold">{fundable}</p>
                <p className="text-sm opacity-85">unidades adicionales que ese ingreso alcanza a pagar ({ars(stock)} en stock comprado)</p>
              </div>
              <div>
                <p className="font-display text-4xl font-extrabold">{ars(fundable * P)}</p>
                <p className="text-sm opacity-85">de facturación si después vende esas unidades al precio final</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="text-sm text-muted lg:col-span-2">
        <p>
          <b className="text-ink">Ejemplo ilustrativo, no un resultado garantizado.</b> Supone que se venden todas las prendas indicadas, al mismo precio, y que la diferencia del club solo tiene las deducciones cargadas. Unidades adicionales = parte entera del ingreso disponible ÷ precio de compra adicional.
        </p>
        <p className="mt-2">
          Ingreso reinvertido, stock comprado y facturación posterior no son beneficio: la venta de ese stock genera facturación, pero el resultado neto depende de los costos del club, de las compras iniciales acordadas y de lo que finalmente venda. Por ejemplo, con un recargo del 30 % y sin deducciones, 30 ventas alcanzan para 9 unidades al precio {brand}; con deducciones o precios distintos el número cambia.
        </p>
      </div>
    </div>
  );
}
