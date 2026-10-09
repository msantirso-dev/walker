import Link from "next/link";
import { campaignMetrics, CAMPAIGN_STATUS_LABEL, effectiveStatus } from "@/modules/campaigns";
import { db } from "@/shared/db";
import { fmtDateTime } from "@/shared/dates";
import { ars } from "@/shared/money";
import { Badge, Bar, Empty, Money, PageHeader, Stat } from "@/shared/ui";
import type { SessionUser } from "@/modules/auth";

/**
 * Inicio del club (solo lectura): campañas y fechas, avance de ventas, pagos, saldo a cobrar a sus socios,
 * resultado económico estimado, producción y entrega, y exportaciones.
 */
export async function ClubHome({ u }: { u: SessionUser }) {
  const clubId = u.clubId ?? "__none__";
  const club = await db.club.findUnique({ where: { id: clubId }, select: { name: true } });
  const campaigns = await db.campaign.findMany({
    where: { clubId, status: { notIn: ["DRAFT", "CANCELLED"] } },
    orderBy: { closesAt: "desc" },
    include: { lots: { select: { status: true, number: true } }, shipments: { select: { status: true, receivedAt: true } } },
  });
  const metrics = await Promise.all(campaigns.map((c) => campaignMetrics(c.id)));
  const t = metrics.reduce(
    (a, m) => ({
      advance: a.advance + m.advanceCollected, pending: a.pending + m.pendingAdvance, balance: a.balance + m.clubBalanceDue,
      collected: a.collected + m.clubBalanceCollected, purchases: a.purchases + m.clubPurchaseAgreed, purchasesPaid: a.purchasesPaid + m.clubPurchasePaid,
    }),
    { advance: 0, pending: 0, balance: 0, collected: 0, purchases: 0, purchasesPaid: 0 },
  );
  const toCollect = Math.max(0, t.balance - t.collected);
  const result = t.balance - t.purchases;
  return (
    <>
      <PageHeader eyebrow={club?.name ?? "Club"} title="Resumen del club">
        Información de consulta. Para registrar novedades o pagos externos, comunicate con la empresa.
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pagos confirmados" value={<Money cents={t.advance} />} hint="Anticipos aprobados por Mercado Pago" />
        <Stat label="Pagos pendientes" value={<Money cents={t.pending} />} hint="Pedidos esperando la acreditación" tone={t.pending ? "warn" : undefined} />
        <Stat label="Saldo a cobrar a socios" value={<Money cents={toCollect} />} hint={`Total ${ars(t.balance)} · cobrado registrado ${ars(t.collected)}`} />
        <Stat label="Resultado estimado" value={<Money cents={result} />} hint="Saldo de socios − compras del club acordadas" tone={result < 0 ? "danger" : undefined} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Estimación: supone que todos los socios pagan su saldo. No incluye costos propios del club. Compras del club acordadas: <Money cents={t.purchases} /> (pagado <Money cents={t.purchasesPaid} />).
      </p>

      <h2 className="mb-3 mt-10 text-2xl font-bold">Campañas</h2>
      {campaigns.length === 0 ? (
        <Empty>Todavía no hay campañas publicadas para el club.</Empty>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c, i) => {
            const m = metrics[i];
            const st = effectiveStatus(c);
            const received = c.shipments.some((s) => s.status === "RECEIVED");
            const production = received ? "En el club, listo para retirar" : c.lots.length ? "En producción" : new Date() > c.closesAt ? "Cerrada: a la espera del inicio de producción" : "Preventa en curso";
            return (
              <article key={c.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/campanas/${c.id}`} className="font-display text-2xl font-bold uppercase hover:underline">
                      {c.title}
                    </Link>
                    <div className="text-sm text-muted">
                      Abre {fmtDateTime(c.opensAt)} · cierra {fmtDateTime(c.closesAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={st === "PUBLISHED" ? "ok" : "info"}>{st === "SCHEDULED" ? "Programada" : CAMPAIGN_STATUS_LABEL[st]}</Badge>
                    <Badge tone="muted">{production}</Badge>
                  </div>
                </div>
                <dl className="num mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  <div><dt className="text-muted">Pedidos confirmados</dt><dd className="text-lg font-bold">{m.ordersConfirmed}</dd></div>
                  <div><dt className="text-muted">Prendas</dt><dd className="text-lg font-bold">{m.unitsConfirmed}</dd></div>
                  <div><dt className="text-muted">Jugadores</dt><dd className="text-lg font-bold">{m.playersConfirmed}</dd></div>
                  <div><dt className="text-muted">Pendientes de pago</dt><dd className="text-lg font-bold">{m.ordersPending}</dd></div>
                  <div><dt className="text-muted">Saldo a cobrar</dt><dd className="text-lg font-bold"><Money cents={Math.max(0, m.clubBalanceDue - m.clubBalanceCollected)} /></dd></div>
                </dl>
                {c.minUnits ? (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-muted">Mínimo: {m.unitsConfirmed} de {c.minUnits}</div>
                    <Bar value={m.unitsConfirmed} max={c.minUnits} />
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/admin/campanas/${c.id}`} className="btn btn-ghost btn-sm">Ver detalle</Link>
                  <Link href={`/admin/pedidos?campana=${c.id}`} className="btn btn-ghost btn-sm">Pedidos y compradores</Link>
                  <a href={`/api/admin/campanas/${c.id}/export?format=xlsx`} className="btn btn-ghost btn-sm">Descargar Excel</a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
