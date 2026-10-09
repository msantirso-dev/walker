import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan, can } from "@/modules/auth";
import { COST_BEARER_LABEL, SHIPMENT_STATUS_LABEL, distributionList } from "@/modules/logistics";
import { LOT_STATUS_LABEL } from "@/modules/production";
import { DELIVERY_STATUS_LABEL } from "@/modules/orders";
import { db } from "@/shared/db";
import { fmtDate, fmtShortTime, toArLocal } from "@/shared/dates";
import { Badge, Empty, Money, PageHeader, Section, Stat } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { createShipmentAction, dispatchAction, receiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Logistics({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const c = await db.campaign.findUnique({
    where: { id },
    include: { club: true, lots: { orderBy: { number: "asc" } }, shipments: { orderBy: { number: "asc" }, include: { lots: { select: { number: true } } } } },
  });
  if (!c) notFound();
  const manage = can(u, "shipments.manage");
  // El club consulta la logística de su campaña (solo lectura); la empresa despacha y confirma la recepción
  if (!manage) assertCan(u, "campaign.view", c.clubId);
  const list = await distributionList(id);
  const readyLots = c.lots.filter((l) => l.status === "READY_TO_SHIP" && !l.shipmentId);
  const today = toArLocal(new Date()).slice(0, 10);
  const units = list.reduce((a, o) => a + o.units.length, 0);
  const delivered = list.reduce((a, o) => a + o.units.filter((x) => x.delivered).length, 0);
  const clubDue = list.reduce((a, o) => a + o.clubDue, 0);

  return (
    <>
      <PageHeader eyebrow={`${c.club.name} · ${c.title}`} title="Logística y retiros" actions={<Link href={`/admin/campanas/${id}`} className="btn btn-ghost">Volver a la campaña</Link>}>
        La producción completa se entrega en el club (sin envío a domicilio), por el transporte que se elija. El flete es a cargo del comprador: se registra, no lo paga la empresa. El seguimiento del sistema termina con la producción en el club; el club cobra el saldo y entrega; la empresa registra en la planilla lo que el club comunica.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos confirmados" value={list.length} />
        <Stat label="Prendas entregadas" value={`${delivered} / ${units}`} />
        <Stat label="Saldo para el club" value={<Money cents={clubDue} />} hint="Lo cobra el club antes del retiro (planilla del club)" />
        <Stat label="Lotes listos para despacho" value={readyLots.length} />
      </div>

      <Section title="Envíos consolidados al club">
        {c.shipments.length === 0 && <Empty>Sin envíos todavía.</Empty>}
        <div className="grid gap-3">
          {c.shipments.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>Envío {s.number} · lotes {s.lots.map((l) => l.number).join(", ")}</b>
                <Badge tone={s.status === "RECEIVED" ? "ok" : s.status === "DISPATCHED" ? "info" : "warn"}>{SHIPMENT_STATUS_LABEL[s.status]}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {s.address} · recibe {s.receiverName}{s.receiverPhone ? ` (${s.receiverPhone})` : ""} · {s.carrier ?? "transporte a definir"}{s.trackingRef ? ` · ref. ${s.trackingRef}` : ""}
                {" · "}costo {s.cost != null ? <Money cents={s.cost} /> : "a definir"} ({COST_BEARER_LABEL[s.costBearer]})
                {s.dispatchedAt && ` · despachado ${fmtDate(s.dispatchedAt)}`}
                {s.receivedAt && ` · recibido ${fmtDate(s.receivedAt)} por ${s.receivedBy}`}
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Link href={`/admin/campanas/${id}/logistica/remito/${s.id}`} className="btn btn-ghost btn-sm">Remito consolidado</Link>
                {manage && s.status === "PREPARING" && (
                  <ActionForm action={dispatchAction.bind(null, id, s.id)} className="flex flex-wrap items-end gap-2">
                    <input name="dispatchedAt" type="date" className="input w-40" defaultValue={today} aria-label="Fecha de despacho" />
                    <input name="carrier" className="input w-40" defaultValue={s.carrier ?? ""} placeholder="Transporte" aria-label="Transporte" />
                    <input name="trackingRef" className="input w-40" defaultValue={s.trackingRef ?? ""} placeholder="Guía o referencia" aria-label="Referencia" />
                    <SubmitButton className="btn btn-primary btn-sm">Marcar despachado</SubmitButton>
                  </ActionForm>
                )}
                {manage && s.status === "DISPATCHED" && (
                  <ActionForm action={receiveAction.bind(null, id, s.id)} className="flex flex-wrap items-end gap-2">
                    <input name="receivedAt" type="date" className="input w-40" defaultValue={today} aria-label="Fecha de recepción" />
                    <input name="receivedBy" className="input w-48" placeholder="Quién recibió" aria-label="Quién recibió" />
                    <input name="notes" className="input w-48" placeholder="Observaciones (faltantes, daños)" aria-label="Observaciones" />
                    <SubmitButton className="btn btn-primary btn-sm">Confirmar recepción en el club</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </div>
          ))}
        </div>

        {manage && readyLots.length > 0 && (
          <ActionForm action={createShipmentAction.bind(null, id)} className="card mt-4 grid gap-3 p-5 md:grid-cols-3">
            <fieldset className="md:col-span-3">
              <legend className="label">Lotes que viajan</legend>
              <div className="flex flex-wrap gap-3">
                {readyLots.map((l) => <label key={l.id} className="flex items-center gap-2"><input type="checkbox" name="lotIds" value={l.id} defaultChecked className="h-5 w-5" /> Lote {l.number} · {LOT_STATUS_LABEL[l.status]}</label>)}
              </div>
            </fieldset>
            <div className="field md:col-span-2"><label htmlFor="address">Dirección de entrega del club</label><input id="address" name="address" className="input" defaultValue={c.club.pickupAddress ?? ""} /></div>
            <div className="field"><label htmlFor="receiverName">Responsable de recepción</label><input id="receiverName" name="receiverName" className="input" /></div>
            <div className="field"><label htmlFor="receiverPhone">Teléfono</label><input id="receiverPhone" name="receiverPhone" className="input" defaultValue={c.club.whatsapp ?? ""} /></div>
            <div className="field"><label htmlFor="carrier">Transporte</label><input id="carrier" name="carrier" className="input" placeholder="Ej.: Via Cargo (sin integración)" /></div>
            <div className="field"><label htmlFor="trackingRef">Guía o referencia</label><input id="trackingRef" name="trackingRef" className="input" /></div>
            <div className="field"><label htmlFor="cost">Costo (si se conoce)</label><input id="cost" name="cost" className="input" inputMode="decimal" /></div>
            <div className="field"><label htmlFor="costBearer">Quién paga el envío</label><select id="costBearer" name="costBearer" className="input" defaultValue="PENDING">{Object.entries(COST_BEARER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><small>Definición comercial pendiente.</small></div>
            <div className="field"><label htmlFor="notes">Notas</label><input id="notes" name="notes" className="input" /></div>
            <SubmitButton className="btn btn-primary justify-self-start">Crear envío</SubmitButton>
          </ActionForm>
        )}
        {manage && readyLots.length === 0 && c.lots.some((l) => !["READY_TO_SHIP", "RECEIVED_BY_CLUB"].includes(l.status)) && (
          <p className="mt-3 text-sm text-muted">Cuando un lote llegue a “Listo para despacho”, se puede armar el envío.</p>
        )}
      </Section>

      <Section
        title="Lista de distribución y retiros"
        actions={
          <span className="flex gap-2">
            <a className="btn btn-ghost btn-sm" href={`/api/admin/campanas/${id}/distribucion?format=xlsx`}>Excel</a>
            <a className="btn btn-ghost btn-sm" href={`/api/admin/campanas/${id}/distribucion?format=csv`}>CSV</a>
          </span>
        }
      >
        {list.length === 0 ? <Empty>Sin pedidos confirmados.</Empty> : (
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Pedido</th><th>Comprador</th><th>Prendas (jugador · talle · personalización)</th><th>Saldo club</th><th>Retiro</th><th></th></tr></thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id}>
                    <td className="font-mono text-sm">{o.code}</td>
                    <td>{o.buyer}<div className="text-xs text-muted">{o.phone}</div></td>
                    <td className="text-sm">
                      {o.units.map((x) => (
                        <div key={x.ref} className={x.delivered ? "text-muted line-through" : ""}>
                          <span className="font-mono text-xs">{x.ref}</span> {x.product} · {x.player ?? "s/jugador"} · {x.sizes}{x.pers ? ` · ${x.pers}` : ""} {!x.inClub && !x.delivered && <Badge tone="muted">aún no llegó</Badge>}
                        </div>
                      ))}
                    </td>
                    <td className="num">{o.clubDue > 0 ? <Money cents={o.clubDue} /> : "—"}</td>
                    <td className="text-sm">
                      {DELIVERY_STATUS_LABEL[o.deliveryStatus]}
                      {o.deliveries.map((d, i) => <div key={i} className="text-xs text-muted">{fmtShortTime(d.at)} · {d.to}{d.exception ? " · con excepción" : ""}</div>)}
                    </td>
                    <td>{o.v2 ? <Link href={`/admin/planilla?q=${o.code}${manage ? `&club=${c.clubId}` : ""}`} className="btn btn-ghost btn-sm">Planilla</Link> : <Link href={`/admin/entregas/${o.id}`} className="btn btn-ghost btn-sm">Entregar</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
