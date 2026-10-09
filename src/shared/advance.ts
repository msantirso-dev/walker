/**
 * Cálculo del modelo v2 (anticipo textil + saldo club). Compartido por la tienda y el servidor; el servidor siempre recalcula.
 *
 * - Los adicionales (nombre, número, leyenda) son de la empresa: se suman al precio de la empresa.
 * - El recargo del club se aplica sobre el total textil de la unidad (producto + adicionales), con la misma
 *   proporción precio al socio / precio de la empresa del producto.
 * - Anticipo A = B + D, con B = total de la empresa (producto + adicionales), P = precio final,
 *   G = P − B (diferencia del club) y D = G × deducciones (hipótesis 21 % + 3,5 % = 24,5 %, pendiente de aprobación).
 *   Saldo al club S = P − A. El comprador ve solo el anticipo y el saldo, sin este desglose.
 * - Redondeo: importes en centavos (enteros). D se redondea al centavo, mitades hacia arriba; A + S = P siempre.
 */
export const DEFAULT_CLUB_TAX_BP = 2450;

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

/**
 * Composición del anticipo de un pedido ya creado (valores congelados por unidad):
 * parte de la empresa (B, producto + adicionales) y otros importes incluidos (D, deducciones).
 */
export function orderAdvanceSplit(units: { status: string; advanceAmount: number; textilPrice: number | null; optionsTextil: number }[]) {
  let back = 0;
  let other = 0;
  for (const u of units) {
    if (u.status !== "ACTIVE" || !u.advanceAmount) continue;
    const b = (u.textilPrice ?? 0) + u.optionsTextil;
    back += b;
    other += u.advanceAmount - b;
  }
  return { back, other, advance: back + other };
}

/**
 * Conciliación de un cobro del proveedor: comisión (costo de la empresa, no se traslada),
 * neto recibido y reparto del importe bruto entre la parte de la empresa y los otros importes.
 */
export function paymentReconciliation(p: { amount: number; providerGross: number | null; providerNet: number | null }, split: { back: number; other: number; advance: number }) {
  const gross = p.providerGross ?? p.amount;
  const fee = p.providerNet != null ? Math.max(0, gross - p.providerNet) : null;
  const ratio = split.advance > 0 ? gross / split.advance : 0;
  const other = Math.round(split.other * ratio);
  return { gross, fee, net: p.providerNet, back: gross - other, other };
}
