/** Importes en centavos. */
const fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function ars(cents: number): string {
  return cents % 100 === 0 ? fmt.format(cents / 100) : fmt2.format(cents / 100);
}

/** "48.000", "48000", "48000,50" → centavos. Devuelve null si no es válido. */
export function parsePesos(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).trim().replace(/\$|\s/g, "");
  if (!s) return null;
  // Formato argentino: punto de miles, coma decimal.
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function pesosInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}

/** Porcentaje expresado en centésimas (1000 = 10,00 %). */
export function percentOf(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10000);
}
