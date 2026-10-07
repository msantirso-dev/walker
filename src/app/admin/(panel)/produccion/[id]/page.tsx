import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/modules/auth";
import { lotReport, LOT_STATUS_LABEL, nextLotStatus } from "@/modules/production";
import { db } from "@/shared/db";
import { fmtDateTime } from "@/shared/dates";
import { Badge, PageHeader, Section, Stat } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { advanceLotAction, approveLotAction, regenerateLotAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const lot = await db.productionLot.findUnique({ where: { id }, include: { campaign: { include: { club: true } } } });
  if (!lot) notFound();
  const clubSide = can(u, "lot.receive", lot.campaign.clubId);
  if (!can(u, "production.view") && !clubSide) notFound();
  if (u.role === "CLUB_ADMIN" && lot.status === "PENDING_APPROVAL") notFound();
  const r = await lotReport(id);
  const next = nextLotStatus(lot.status);
  const canNext = next && next !== "APPROVED" && (next === "RECEIVED_BY_CLUB" ? clubSide : can(u, "production.advance"));

  return (
    <>
      <PageHeader
        eyebrow={`${r.club} · ${r.campaign}`}
        title={`Lote ${r.lotNumber}${r.kind === "ADJUSTMENT" ? " · ajuste" : ""}`}
        actions={
          <>
            <a className="btn btn-ghost btn-sm" href={`/api/admin/lotes/${id}/export?format=xlsx`}>Excel</a>
            <a className="btn btn-ghost btn-sm" href={`/api/admin/lotes/${id}/export?format=csv`}>CSV consolidado</a>
            <a className="btn btn-ghost btn-sm" href={`/api/admin/lotes/${id}/export?format=csv&part=personalizacion`}>CSV personalización</a>
          </>
        }
      >
        <Badge tone={lot.status === "PENDING_APPROVAL" ? "warn" : "info"}>{LOT_STATUS_LABEL[lot.status]}</Badge>{" "}
        {lot.approvedAt ? `Aprobado el ${fmtDateTime(lot.approvedAt)}: versión congelada.` : "Borrador: se puede recalcular hasta aprobarlo."}
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        {lot.status === "PENDING_APPROVAL" && can(u, "production.plan") && (
          <>
            <ActionForm action={approveLotAction.bind(null, id)} className=""><SubmitButton className="btn btn-primary">Aprobar y enviar a fábrica</SubmitButton></ActionForm>
            <ActionForm action={regenerateLotAction.bind(null, id)} className=""><SubmitButton className="btn btn-ghost">Recalcular</SubmitButton></ActionForm>
          </>
        )}
        {canNext && (
          <ActionForm action={advanceLotAction.bind(null, id, next!)} className="">
            <SubmitButton className="btn btn-primary">Pasar a: {LOT_STATUS_LABEL[next!]}</SubmitButton>
          </ActionForm>
        )}
        <Link href={`/admin/campanas/${lot.campaignId}`} className="btn btn-ghost">Campaña</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Prendas (neto)" value={r.lines.reduce((a, l) => a + l.quantity, 0)} hint="Suma de componentes a fabricar" />
        <Stat label="Productos vendidos" value={r.totalUnits} hint={r.kind === "ADJUSTMENT" ? "Altas menos bajas" : undefined} />
        <Stat label="Personalizadas" value={r.personalization.filter((p) => p.delta > 0).length} />
        <Stat label="Códigos de prenda" value={r.garments.length} />
      </div>

      <Section title="Orden de fabricación consolidada">
        <p className="mb-3 text-sm text-muted">Los componentes de conjuntos y combos se suman con las prendas sueltas del mismo código, sin duplicar.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {r.garments.map((g) => (
            <div key={g.code} className="card tbl-wrap">
              <div className="flex items-baseline justify-between gap-2 px-3 pt-3">
                <div><span className="font-mono text-sm">{g.code}</span> <b>{g.name}</b> {g.variant && <span className="text-muted">· {g.variant}</span>}</div>
                <span className="font-display text-2xl font-bold">{g.total}</span>
              </div>
              <table className="tbl">
                <thead><tr><th>Talle</th><th>Cantidad</th></tr></thead>
                <tbody>{r.lines.filter((l) => l.garmentCode === g.code).map((l) => <tr key={l.size}><td className="font-bold">{l.size}</td><td className={`num ${l.quantity < 0 ? "text-danger" : ""}`}>{l.quantity > 0 && r.kind === "ADJUSTMENT" ? "+" : ""}{l.quantity}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Detalle por producto y componente">
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Producto</th><th>Componente</th><th>Prenda</th><th>Talle</th><th>Cantidad</th></tr></thead>
            <tbody>{r.breakdown.map((b, i) => <tr key={i}><td>{b.productName}<div className="font-mono text-xs text-muted">{b.productCode}</div></td><td>{b.component}</td><td className="font-mono text-sm">{b.garmentCode}</td><td className="font-bold">{b.size}</td><td className="num">{b.quantity}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section title="Personalización por unidad">
        {r.personalization.length === 0 ? <p className="card p-4 text-muted">Sin prendas personalizadas.</p> : (
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Ref.</th><th>Prenda</th><th>Talle</th><th>Nombre</th><th>Número</th><th>Movimiento</th></tr></thead>
              <tbody>{r.personalization.map((p) => <tr key={p.unitRef + p.delta}><td className="font-mono text-xs">{p.unitRef}</td><td className="font-mono text-sm">{p.garmentCode}</td><td className="font-bold">{p.size}</td><td>{p.name ?? "—"}</td><td className="num">{p.number ?? "—"}</td><td>{p.delta > 0 ? <Badge tone="ok">Alta</Badge> : <Badge tone="danger">Baja</Badge>}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
