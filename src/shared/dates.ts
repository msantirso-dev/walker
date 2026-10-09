/** Argentina no usa horario de verano: UTC−3 fijo. */
export const AR_TZ = "America/Argentina/Buenos_Aires";
const AR_OFFSET = "-03:00";

const dtf = new Intl.DateTimeFormat("es-AR", { timeZone: AR_TZ, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const df = new Intl.DateTimeFormat("es-AR", { timeZone: AR_TZ, dateStyle: "long" });
const dShort = new Intl.DateTimeFormat("es-AR", { timeZone: AR_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const dtShort = new Intl.DateTimeFormat("es-AR", { timeZone: AR_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const fmtDateTime = (d: Date) => dtf.format(d) + " h";
export const fmtDate = (d: Date) => df.format(d);
export const fmtShort = (d: Date) => dShort.format(d);
export const fmtShortTime = (d: Date) => dtShort.format(d);

/** "2026-10-31T23:59" (datetime-local, hora argentina) → Date UTC. */
export function parseArLocal(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00${AR_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "2026-10-31T23:59" en hora argentina, para inputs datetime-local. */
export function toArLocal(d: Date | null | undefined): string {
  if (!d) return "";
  const ar = new Date(d.getTime() - 3 * 3600_000);
  return ar.toISOString().slice(0, 16);
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400_000);
}

/** Plazo estimado de entrega: con días corridos se pueden mostrar fechas; si no, solo el plazo (sin prometer más). */
export function deliveryWindowText(c: { closesAt: Date; deliveryDaysMin: number; deliveryDaysMax: number; deliveryDaysKind?: string | null }) {
  const kind = c.deliveryDaysKind ?? "PENDING";
  const span = `${c.deliveryDaysMin} a ${c.deliveryDaysMax} días`;
  if (kind === "CALENDAR") return `${span} corridos desde el cierre (entre el ${fmtDate(addDays(c.closesAt, c.deliveryDaysMin))} y el ${fmtDate(addDays(c.closesAt, c.deliveryDaysMax))})`;
  if (kind === "BUSINESS") return `${span} hábiles desde el cierre`;
  return `${span} desde el cierre (a confirmar si son corridos o hábiles)`;
}
