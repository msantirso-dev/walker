import Link from "next/link";
import { ars } from "@/shared/money";

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={`num ${className ?? ""}`}>{ars(cents)}</span>;
}

export type Tone = "ok" | "warn" | "danger" | "info" | "muted";
export function Badge({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PageHeader({ eyebrow, title, actions, children }: { eyebrow?: string; title: string; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="text-4xl font-extrabold md:text-5xl">{title}</h1>
        {children && <div className="mt-2 text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  return (
    <div className="card min-w-0 p-4">
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 font-display text-3xl font-bold ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, actions, id }: { title: string; children: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  return (
    <section className="mt-8" id={id}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-center text-muted">{children}</div>;
}

export function Bar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Secciones">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-semibold ${t.key === current ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
