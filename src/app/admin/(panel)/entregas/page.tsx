import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can, clubScope } from "@/modules/auth";
import { DELIVERY_STATUS_LABEL } from "@/modules/orders";
import { db } from "@/shared/db";
import { Badge, Empty, Money, PageHeader } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { findByCodeAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Deliveries({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  const u = await requireUser();
  if (!can(u, "deliveries.register")) notFound();
  const { q, ver } = await searchParams;
  const statuses = ver === "entregados" ? ["DELIVERED"] : ["READY", "PARTIAL"];
  const orders = await db.order.findMany({
    where: {
      ...clubScope(u),
      status: "CONFIRMED",
      deliveryStatus: { in: statuses as never },
      ...(q ? { OR: [{ buyerName: { contains: q, mode: "insensitive" } }, { code: { contains: q.toUpperCase() } }, { players: { some: { name: { contains: q, mode: "insensitive" } } } }] } : {}),
    },
    orderBy: { buyerName: "asc" },
    take: 200,
    include: { players: true, campaign: { select: { title: true } }, _count: { select: { units: { where: { status: "ACTIVE", deliveryId: null } } } } },
  });
  return (
    <>
      <PageHeader eyebrow="Retiros en sede" title="Entregas" />
      <div className="grid gap-4 md:grid-cols-2">
        <ActionForm action={findByCodeAction} className="card grid gap-3 p-4">
          <div className="field"><label htmlFor="code">Código de retiro o de pedido</label><input id="code" name="code" className="input font-mono uppercase" autoComplete="off" placeholder="Ej.: 7KQ2M9XHRT o K7Q-4MZ2" /></div>
          <SubmitButton className="btn btn-primary justify-self-start" pendingText="Buscando…">Buscar</SubmitButton>
          <small className="hint">El QR del comprador abre directamente el pedido en este panel.</small>
        </ActionForm>
        <form className="card grid gap-3 p-4" method="get">
          <div className="field"><label htmlFor="q">Buscar por nombre</label><input id="q" name="q" className="input" defaultValue={q} placeholder="Comprador o jugador" /></div>
          <div className="flex gap-2">
            <button className="btn btn-ghost">Buscar</button>
            <Link href={ver === "entregados" ? "/admin/entregas" : "/admin/entregas?ver=entregados"} className="btn btn-ghost">{ver === "entregados" ? "Ver pendientes" : "Ver entregados"}</Link>
          </div>
        </form>
      </div>
      <div className="mt-6">
        {orders.length === 0 ? <Empty>{ver === "entregados" ? "Sin entregas completas." : "No hay pedidos listos para retirar."}</Empty> : (
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Pedido</th><th>Comprador</th><th>Jugadores</th><th>Por entregar</th><th>Saldo</th><th>Estado</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/admin/entregas/${o.id}`} className="font-mono font-semibold underline">{o.code}</Link><div className="text-xs text-muted">{o.campaign.title}</div></td>
                    <td>{o.buyerName}</td>
                    <td className="text-sm">{o.players.map((p) => `${p.name}${p.category ? ` (${p.category})` : ""}`).join(", ") || "—"}</td>
                    <td className="num">{o._count.units}</td>
                    <td className="num">{o.total > o.paidAmount ? <span className="font-bold text-danger"><Money cents={o.total - o.paidAmount} /></span> : "Pagado"}</td>
                    <td><Badge tone={o.deliveryStatus === "DELIVERED" ? "ok" : o.deliveryStatus === "PARTIAL" ? "warn" : "info"}>{DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
