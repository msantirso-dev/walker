import Link from "next/link";
import { requireUser, assertCan, clubScope } from "@/modules/auth";
import { orderWhere, paymentStateLabel, ORDER_STATUS_LABEL, DELIVERY_STATUS_LABEL } from "@/modules/orders";
import { db } from "@/shared/db";
import { fmtShortTime } from "@/shared/dates";
import { Badge, Empty, Money, PageHeader } from "@/shared/ui";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser();
  assertCan(u, "orders.view");
  const sp = await searchParams;
  const scope = clubScope(u);
  const campaigns = await db.campaign.findMany({ where: { ...scope, status: { not: "DRAFT" } }, orderBy: { closesAt: "desc" }, select: { id: true, title: true, club: { select: { name: true } }, clubId: true } });
  const campaignId = sp.campana && campaigns.some((c) => c.id === sp.campana) ? sp.campana : undefined;
  const base = { ...scope, ...(campaignId ? { campaignId } : {}), ...(sp.alerta === "cupo" ? { overCapacity: true } : {}) };
  const where = orderWhere(base, { q: sp.q, status: sp.status, pay: sp.pay, delivery: sp.delivery, category: sp.category, productId: sp.product });
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [orders, total] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE, include: { campaign: { select: { title: true } }, _count: { select: { units: { where: { status: "ACTIVE" } }, players: true } } } }),
    db.order.count({ where }),
  ]);
  const cats = campaignId
    ? await db.player.findMany({ where: { order: { campaignId } }, distinct: ["category"], select: { category: true } })
    : [];
  const products = campaignId ? await db.campaignProduct.findMany({ where: { campaignId }, include: { product: { select: { id: true, name: true } } } }) : [];
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Pedidos y compradores"
        title="Pedidos"
        actions={campaignId && (
          <>
            <a className="btn btn-ghost btn-sm" href={`/api/admin/campanas/${campaignId}/export?format=xlsx`}>Exportar Excel</a>
            <a className="btn btn-ghost btn-sm" href={`/api/admin/campanas/${campaignId}/export?format=csv`}>Exportar CSV</a>
          </>
        )}
      />
      <form className="card mb-4 grid gap-3 p-4 md:grid-cols-4" method="get">
        <div className="field md:col-span-2"><label htmlFor="q">Buscar</label><input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Código, comprador, correo, celular o jugador" /></div>
        <div className="field">
          <label htmlFor="campana">Campaña</label>
          <select id="campana" name="campana" className="input" defaultValue={campaignId ?? ""}>
            <option value="">Todas</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.club.name} · {c.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Pedido</label>
          <select id="status" name="status" className="input" defaultValue={sp.status ?? ""}>
            <option value="">Todos</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pay">Pago</label>
          <select id="pay" name="pay" className="input" defaultValue={sp.pay ?? ""}>
            <option value="">Todos</option>
            <option value="unpaid">Sin pagos</option>
            <option value="review">Comprobante en revisión</option>
            <option value="deposit">Con saldo pendiente</option>
            <option value="paid">Pagados</option>
            <option value="club">Con saldo para el club</option>
            <option value="refund">Devolución pendiente</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="delivery">Entrega</label>
          <select id="delivery" name="delivery" className="input" defaultValue={sp.delivery ?? ""}>
            <option value="">Todas</option>
            {Object.entries(DELIVERY_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {campaignId && (
          <>
            <div className="field">
              <label htmlFor="category">Categoría</label>
              <select id="category" name="category" className="input" defaultValue={sp.category ?? ""}>
                <option value="">Todas</option>
                {cats.filter((c) => c.category).map((c) => <option key={c.category!} value={c.category!}>{c.category}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="product">Producto</label>
              <select id="product" name="product" className="input" defaultValue={sp.product ?? ""}>
                <option value="">Todos</option>
                {products.map((p) => <option key={p.product.id} value={p.product.id}>{p.product.name}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="flex items-end gap-2 md:col-span-4">
          <button className="btn btn-primary">Filtrar</button>
          <Link href="/admin/pedidos" className="btn btn-ghost">Limpiar</Link>
          <span className="ml-auto text-sm text-muted">{total} pedido(s)</span>
        </div>
      </form>

      {orders.length === 0 ? <Empty>No hay pedidos con esos filtros.</Empty> : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Pedido</th><th>Comprador</th><th>Campaña</th><th>Prendas</th><th>Total</th><th>Saldo</th><th>Pedido</th><th>Pago</th><th>Entrega</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/pedidos/${o.id}`} className="font-mono font-semibold underline">{o.code}</Link><div className="text-xs text-muted">{fmtShortTime(o.createdAt)}</div></td>
                  <td>{o.buyerName}<div className="text-xs text-muted">{o.buyerPhone}</div></td>
                  <td className="text-sm">{o.campaign.title}</td>
                  <td className="num">{o._count.units}<div className="text-xs text-muted">{o._count.players} jug.</div></td>
                  <td className="num"><Money cents={o.total} /></td>
                  <td className="num"><Money cents={o.status === "CANCELLED" ? 0 : Math.max(0, o.total - o.paidAmount)} /></td>
                  <td><Badge tone={o.status === "CONFIRMED" ? "ok" : o.status === "PENDING_PAYMENT" ? "warn" : o.status === "CANCELLED" ? "danger" : "muted"}>{ORDER_STATUS_LABEL[o.status]}</Badge>{o.overCapacity && <Badge tone="danger">Fuera de cupo</Badge>}</td>
                  <td><Badge tone={o.inReviewAmount > 0 ? "info" : o.paidAmount >= o.total ? "ok" : "muted"}>{paymentStateLabel(o)}</Badge></td>
                  <td className="text-sm">{o.status === "CONFIRMED" ? DELIVERY_STATUS_LABEL[o.deliveryStatus] : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="mt-4 flex gap-2">
          {page > 1 && <Link className="btn btn-ghost btn-sm" href={qs({ page: String(page - 1) })}>Anterior</Link>}
          {page * PAGE < total && <Link className="btn btn-ghost btn-sm" href={qs({ page: String(page + 1) })}>Siguiente</Link>}
        </div>
      )}
    </>
  );
}
