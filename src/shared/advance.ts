/**
 * Cálculo del modelo v2 (anticipo textil + saldo club). Compartido por la tienda y el servidor; el servidor siempre recalcula.
 *
 * - Los adicionales (nombre, número, leyenda) son de la textil: se suman al precio textil.
 * - El recargo del club se aplica sobre el total textil de la unidad (producto + adicionales), con la misma
 *   proporción precio al socio / precio textil del producto.
 * - El anticipo cubre el total textil más una cobertura impositiva sobre la diferencia del club
 *   (por defecto 24 % = 21 % + 3 %), porque la venta total se factura por el fabricante.
 *   El comprador ve solo el anticipo y el saldo, sin este desglose.
 */
export const DEFAULT_CLUB_TAX_BP = 2400;

export function advanceUnit(o: { textil: number; price: number; extrasTextil: number; taxBp: number }) {
  const extrasFinal = o.textil > 0 ? Math.round((o.extrasTextil * o.price) / o.textil) : o.extrasTextil;
  const final = o.price + extrasFinal;
  const base = o.textil + o.extrasTextil;
  const margin = Math.max(0, final - base);
  const tax = Math.round((margin * o.taxBp) / 10000);
  const advance = base + tax;
  return { extrasFinal, final, base, margin, tax, advance, club: final - advance };
}

/** Precio de un adicional tal como lo ve el comprador (con el recargo del club). */
export const extraForBuyer = (extraTextil: number, textil: number | null, price: number) => (textil ? Math.round((extraTextil * price) / textil) : extraTextil);
