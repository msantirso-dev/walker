import { notFound } from "next/navigation";
import { requireUser, assertCan, can } from "@/modules/auth";
import { COST_BEARER_LABEL, SHIPMENT_STATUS_LABEL, shipmentRemito } from "@/modules/logistics";
import { env } from "@/shared/env";
import { fmtDate, fmtDateTime } from "@/shared/dates";
import { BrandMark } from "@/app/_brand/mark";
import { getBrand } from "@/modules/brand";

export const dynamic = "force-dynamic";

/** Remito consolidado imprimible: acompaña la mercadería al club. */
export default async function Remito({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const u = await requireUser();
  const r = await shipmentRemito(sid).catch(() => null);
  if (!r || r.shipment.campaignId !== id) notFound();
  if (!can(u, "shipments.manage")) assertCan(u, "campaign.view", r.shipment.clubId);
  const s = r.shipment;
  return (
    <article className="card mx-auto max-w-3xl p-6 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <BrandMark size="md" className="mb-2" />
          <div className="eyebrow">{(await getBrand()).name} · Remito consolidado</div>
          <h1 className="text-3xl font-extrabold">Envío {s.number} · {s.club.name}</h1>
          <p className="text-sm text-muted">{s.campaign.title} · lotes {r.lots.join(", ")}</p>
        </div>
        <div className="text-right text-sm">
          <div>Emitido {fmtDateTime(new Date())}</div>
          <div>Estado: {SHIPMENT_STATUS_LABEL[s.status]}</div>
          {s.dispatchedAt && <div>Despacho: {fmtDate(s.dispatchedAt)}</div>}
        </div>
      </header>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Entregar en</dt><dd>{s.address}</dd>
        <dt className="text-muted">Recibe</dt><dd>{s.receiverName}{s.receiverPhone ? ` · ${s.receiverPhone}` : ""}</dd>
        <dt className="text-muted">Transporte</dt><dd>{s.carrier ?? "A definir"}{s.trackingRef ? ` · ${s.trackingRef}` : ""}</dd>
        <dt className="text-muted">Costo de envío</dt><dd>{s.cost != null ? `$ ${(s.cost / 100).toLocaleString("es-AR")}` : "A definir"} · a cargo de: {COST_BEARER_LABEL[s.costBearer]}</dd>
      </dl>
      <h2 className="mt-6 text-xl font-bold">Contenido ({r.totalUnits} productos)</h2>
      <table className="tbl mt-2">
        <thead><tr><th>Producto</th><th>Componente</th><th>Talle</th><th>Cant.</th></tr></thead>
        <tbody>{r.lines.map((l, i) => <tr key={i}><td>{l.product}</td><td>{l.component}</td><td className="font-bold">{l.size}</td><td className="num">{l.qty}</td></tr>)}</tbody>
      </table>
      <h2 className="mt-6 text-xl font-bold">Bultos por pedido</h2>
      <table className="tbl mt-2">
        <thead><tr><th>Pedido</th><th>Comprador</th><th>Productos</th></tr></thead>
        <tbody>{r.orders.map((o) => <tr key={o.code}><td className="font-mono">{o.code}</td><td>{o.buyer}</td><td className="num">{o.units}</td></tr>)}</tbody>
      </table>
      <footer className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div className="border-t border-ink pt-2">Entregó (textil / transporte)</div>
        <div className="border-t border-ink pt-2">Recibió conforme (club) · fecha y aclaración</div>
      </footer>
    </article>
  );
}
