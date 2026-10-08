import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, clubScope, can } from "@/modules/auth";
import { campaignMetrics, CAMPAIGN_STATUS_LABEL, effectiveStatus } from "@/modules/campaigns";
import { db } from "@/shared/db";
import { expiringAgreements } from "@/modules/agreements";
import { fmtDate } from "@/shared/dates";
import { Badge, Bar, Empty, Money, PageHeader, Stat } from "@/shared/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const u = await requireUser();
  if (u.role === "PRODUCTION") redirect("/admin/produccion");
  if (u.role === "DELIVERY") redirect("/admin/entregas");
  const scope = clubScope(u);

  const campaigns = await db.campaign.findMany({
    where: { ...scope, status: { in: ["PUBLISHED", "CLOSED", "IN_PRODUCTION", "READY_FOR_PICKUP"] } },
    include: { club: { select: { name: true } } },
    orderBy: { closesAt: "asc" },
  });
  const metrics = await Promise.all(campaigns.map((c) => campaignMetrics(c.id)));
  const reviewCount = await db.payment.count({ where: { status: "IN_REVIEW", order: scope } });
  const pendingLots = can(u, "production.plan") ? await db.productionLot.count({ where: { status: "PENDING_APPROVAL", campaign: scope } }) : 0;
  const overCap = await db.order.count({ where: { ...scope, overCapacity: true, status: "CONFIRMED" } });
  const refundPending = await db.order.count({ where: { ...scope, status: "CANCELLED", paidAmount: { gt: 0 } } });
  const expiring = can(u, "agreements.manage") ? await expiringAgreements() : [];
  const activations = await db.campaign.findMany({ where: { ...scope, status: u.role === "TEXTIL_ADMIN" ? "ACTIVATION_REQUESTED" : "ACTIVATION_APPROVED" }, select: { id: true, title: true, club: { select: { name: true } } } });
  const clubPending = await db.order.count({ where: { ...scope, pricingModel: "TEXTIL_ADVANCE", status: "CONFIRMED", deliveryStatus: { in: ["READY", "PARTIAL"] }, NOT: { clubPaid: { gte: db.order.fields.clubBalanceRequired } } } });

  const tot = metrics.reduce(
    (a, m) => ({ collected: a.collected + m.collected, balance: a.balance + m.balanceDue, units: a.units + m.unitsConfirmed, review: a.review + m.inReview }),
    { collected: 0, balance: 0, units: 0, review: 0 },
  );

  return (
    <>
      <PageHeader eyebrow="Resumen" title="Inicio" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cobrado" value={<Money cents={tot.collected} />} hint="Pagos aprobados, neto de devoluciones" />
        <Stat label="Saldo pendiente" value={<Money cents={tot.balance} />} hint="De pedidos confirmados" />
        <Stat label="Prendas confirmadas" value={tot.units} />
        <Stat label="En revisión" value={<Money cents={tot.review} />} hint={`${reviewCount} comprobante(s)`} tone={reviewCount ? "warn" : undefined} />
      </div>

      {(reviewCount > 0 || pendingLots > 0 || overCap > 0 || refundPending > 0 || expiring.length > 0 || activations.length > 0 || clubPending > 0) && (
        <div className="mt-6 grid gap-2">
          {activations.map((a) => (
            <Link key={a.id} href={`/admin/campanas/${a.id}`} className="notice notice-info font-semibold">
              {u.role === "TEXTIL_ADMIN" ? `${a.club.name} solicitó activar “${a.title}”: revisá y autorizá →` : `“${a.title}” está autorizada: ya la podés publicar →`}
            </Link>
          ))}
          {expiring.map((a) => (
            <Link key={a.id} href={`/admin/clubes/${a.clubId}/acuerdo`} className="notice notice-warn font-semibold">
              {`El acuerdo con ${a.club.name} ${a.daysLeft > 0 ? `vence en ${a.daysLeft} días (${fmtDate(a.endsAt)})` : "está vencido"} →`}
            </Link>
          ))}
          {clubPending > 0 && <Link href="/admin/pedidos?pay=club" className="notice notice-warn font-semibold">{clubPending} pedido(s) listos para retirar con saldo al club pendiente →</Link>}
          {reviewCount > 0 && can(u, "payments.review") && <Link href="/admin/pagos" className="notice notice-info font-semibold">Hay {reviewCount} comprobante(s) esperando revisión →</Link>}
          {pendingLots > 0 && <Link href="/admin/produccion" className="notice notice-warn font-semibold">Hay {pendingLots} lote(s) de producción pendientes de aprobación →</Link>}
          {overCap > 0 && <Link href="/admin/pedidos?alerta=cupo" className="notice notice-danger font-semibold">{overCap} pedido(s) confirmados fuera de cupo requieren una decisión →</Link>}
          {refundPending > 0 && <Link href="/admin/pedidos?pay=refund" className="notice notice-warn font-semibold">{refundPending} pedido(s) cancelados con devolución pendiente →</Link>}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-2xl font-bold">Campañas en curso</h2>
      {campaigns.length === 0 ? (
        <Empty>No hay campañas en curso.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((c, i) => {
            const m = metrics[i];
            const st = effectiveStatus(c);
            return (
              <Link key={c.id} href={`/admin/campanas/${c.id}`} className="card block p-5 hover:border-ink">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="eyebrow">{c.club.name}</div>
                    <div className="font-display text-2xl font-bold uppercase">{c.title}</div>
                    <div className="text-sm text-muted">Cierra el {fmtDate(c.closesAt)}</div>
                  </div>
                  <Badge tone={st === "PUBLISHED" ? "ok" : "info"}>{st === "SCHEDULED" ? "Programada" : CAMPAIGN_STATUS_LABEL[st]}</Badge>
                </div>
                <dl className="num mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-muted">Pedidos conf.</dt><dd className="text-lg font-bold">{m.ordersConfirmed}</dd></div>
                  <div><dt className="text-muted">Prendas conf.</dt><dd className="text-lg font-bold">{m.unitsConfirmed}</dd></div>
                  <div><dt className="text-muted">Cobrado</dt><dd className="text-lg font-bold"><Money cents={m.collected} /></dd></div>
                </dl>
                {c.minUnits ? (
                  <div className="mt-3">
                    <div className="mb-1 text-xs text-muted">Mínimo: {m.unitsConfirmed} de {c.minUnits}</div>
                    <Bar value={m.unitsConfirmed} max={c.minUnits} />
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
