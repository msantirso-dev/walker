import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireUser, assertCan, can } from "@/modules/auth";
import { campaignMetrics, CAMPAIGN_STATUS_LABEL, MIN_DECISION_LABEL, effectiveStatus, activationProblems, AUDIENCE_LABEL } from "@/modules/campaigns";
import { LOT_STATUS_LABEL } from "@/modules/production";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { fmtDate, fmtDateTime, toArLocal, addDays } from "@/shared/dates";
import { Badge, Bar, Money, PageHeader, Section, Stat } from "@/shared/ui";
import { ActionForm, ConfirmAction, CopyButton, SubmitButton } from "@/shared/ui/client";
import { activationAction, campaignAction, cancelCampaignAction, generateLotAction, minDecisionAction, productionNoticeAction, settlementAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const c = await db.campaign.findUnique({
    where: { id },
    include: { club: true, paymentAccount: true, benefitRule: true, lots: { orderBy: { number: "asc" }, include: { _count: { select: { units: true } } } }, settlements: { orderBy: { settledAt: "asc" } } },
  });
  if (!c) notFound();
  assertCan(u, "campaign.view", c.clubId);
  const manage = can(u, "campaign.manage");
  const requester = manage || can(u, "campaign.request", c.clubId);
  const advance = c.pricingModel === "TEXTIL_ADVANCE";
  const pendingActivation = advance && ["DRAFT", "ACTIVATION_REQUESTED", "ACTIVATION_APPROVED"].includes(c.status);
  const problems = pendingActivation ? await activationProblems(id) : [];
  const m = await campaignMetrics(id);
  const st = effectiveStatus(c);
  const url = `${env().APP_URL}/club/${c.club.slug}/${c.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 180 });
  const belowMin = c.minUnits != null && m.unitsConfirmed < c.minUnits;
  const windowEnded = c.closesAt <= new Date() || ["CLOSED", "IN_PRODUCTION", "READY_FOR_PICKUP", "FINISHED"].includes(c.status);

  return (
    <>
      <PageHeader
        eyebrow={c.club.name}
        title={c.title}
        actions={
          <>
            <Badge tone={st === "PUBLISHED" ? "ok" : st === "CANCELLED" ? "danger" : "info"}>{st === "SCHEDULED" ? "Programada" : CAMPAIGN_STATUS_LABEL[st]}</Badge>
            {requester && <Link href={`/admin/campanas/${id}/editar`} className="btn btn-ghost">{manage ? "Configurar" : "Precios y alcance"}</Link>}
            {manage && advance && <Link href={`/admin/campanas/${id}/logistica`} className="btn btn-ghost">Logística</Link>}
            {!manage && advance && can(u, "lot.receive", c.clubId) && <Link href={`/admin/campanas/${id}/logistica`} className="btn btn-ghost">Recepción y retiros</Link>}
            <Link href={`/admin/pedidos?campana=${id}`} className="btn btn-primary">Pedidos</Link>
          </>
        }
      >
        {fmtDateTime(c.opensAt)} → {fmtDateTime(c.closesAt)} · Cobra: {c.paymentAccount.owner === "TEXTIL" ? "la textil" : "el club"} ({c.paymentAccount.label})
      </PageHeader>

      {pendingActivation && (
        <section className="card mb-6 p-5">
          <div className="eyebrow">Activación de la campaña</div>
          <p className="mt-1 text-sm text-muted">
            La empresa arma la campaña con lo acordado con el club (productos, precio al socio, alcance: {AUDIENCE_LABEL[c.audience]}), registra la autorización y la publica. El club la consulta.
          </p>
          {c.activationNote && <p className="notice notice-info mt-3 text-sm">Nota: {c.activationNote}</p>}
          {problems.length > 0 ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-warn">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          ) : (
            <p className="mt-3 text-sm text-ok">Precios y reglas completos.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {c.status === "DRAFT" && requester && (
              <ActionForm action={activationAction.bind(null, id, "request")} className="flex flex-wrap items-end gap-2">
                <input name="note" className="input w-64" placeholder="Comentario (opcional)" aria-label="Comentario" />
                <SubmitButton className="btn btn-primary">Solicitar activación</SubmitButton>
              </ActionForm>
            )}
            {manage && ["DRAFT", "ACTIVATION_REQUESTED"].includes(c.status) && (
              <ActionForm action={activationAction.bind(null, id, "approve")} className=""><SubmitButton className="btn btn-primary">Autorizar activación</SubmitButton></ActionForm>
            )}
            {manage && ["ACTIVATION_REQUESTED", "ACTIVATION_APPROVED"].includes(c.status) && (
              <ConfirmAction label="Volver a borrador" confirmLabel="La campaña vuelve a borrador con el motivo.">
                <ActionForm action={activationAction.bind(null, id, "reject")} className="grid gap-2">
                  <input name="reason" className="input" placeholder="Motivo" aria-label="Motivo" />
                  <SubmitButton className="btn btn-danger">Devolver</SubmitButton>
                </ActionForm>
              </ConfirmAction>
            )}
            {requester && c.status === "ACTIVATION_APPROVED" && (
              <ActionForm action={campaignAction.bind(null, id, "publish")} className=""><SubmitButton className="btn btn-primary">Publicar</SubmitButton></ActionForm>
            )}
          </div>
        </section>
      )}

      {manage && (
        <div className="mb-6 flex flex-wrap gap-2">
          {c.status === "DRAFT" && !advance && <ActionForm action={campaignAction.bind(null, id, "publish")} className=""><SubmitButton className="btn btn-primary">Publicar</SubmitButton></ActionForm>}
          {c.status === "PUBLISHED" && <ActionForm action={campaignAction.bind(null, id, "close")} className=""><SubmitButton className="btn btn-ghost">Cerrar ventana ahora</SubmitButton></ActionForm>}
          {c.status === "READY_FOR_PICKUP" && <ActionForm action={campaignAction.bind(null, id, "finish")} className=""><SubmitButton className="btn btn-ghost">Finalizar campaña</SubmitButton></ActionForm>}
          {!["FINISHED", "CANCELLED"].includes(c.status) && (
            <ConfirmAction label="Cancelar campaña" confirmLabel="Cancelar la campaña bloquea compras y pagos. No cancela pedidos ni devuelve dinero automáticamente.">
              <ActionForm action={cancelCampaignAction.bind(null, id)} className="grid gap-2">
                <input name="reason" className="input" placeholder="Motivo" aria-label="Motivo de la cancelación" />
                <SubmitButton className="btn btn-danger">Confirmar cancelación</SubmitButton>
              </ActionForm>
            </ConfirmAction>
          )}
        </div>
      )}

      <section className="card grid gap-4 p-5 md:grid-cols-[auto_1fr] md:items-center">
        <div className="mx-auto rounded bg-white p-2" role="img" aria-label="Código QR de la tienda" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="min-w-0">
          <div className="eyebrow">Enlace para difundir</div>
          <p className="mt-1 break-all font-mono text-sm">{url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={url} />
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Abrir tienda</a>
          </div>
          <p className="mt-2 text-xs text-muted">Hacé captura del QR o imprimilo desde el navegador para carteles en el club.</p>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Prendas" value={`${m.unitsConfirmed} / ${m.unitsRequested}`} hint="Confirmadas / solicitadas (incluye reservas sin pago)" />
        <Stat label={advance ? "Pedidos con anticipo" : "Pedidos con seña o pago"} value={m.ordersConfirmed} hint={`${m.ordersPending} pendientes · ${m.ordersInReview} en revisión`} />
        {advance ? (
          <>
            <Stat label="Anticipos cobrados (textil)" value={<Money cents={m.advanceCollected} />} hint={m.inReview ? <>En revisión: <Money cents={m.inReview} /></> : "Por Mercado Pago"} />
            <Stat label="Saldo para el club" value={<Money cents={m.clubBalanceDue} />} hint={`${m.ordersClubPending} pedidos · lo cobra el club`} />
          </>
        ) : (
          <>
            <Stat label="Cobrado" value={<Money cents={m.collected} />} hint={m.inReview ? <>En revisión: <Money cents={m.inReview} /></> : "Neto de devoluciones"} />
            <Stat label="Saldo pendiente" value={<Money cents={m.balanceDue} />} hint={`${m.ordersDepositOnly} pedidos con saldo`} />
          </>
        )}
        <Stat label="Listos para retirar" value={m.ordersReady} />
        <Stat label="Entregados" value={m.ordersDelivered} />
        <Stat label="En lotes aprobados" value={m.unitsInLots} hint="Prendas enviadas a fábrica" />
        <Stat label="Devoluciones pendientes" value={<Money cents={m.refundPending} />} tone={m.refundPending ? "warn" : undefined} />
      </div>

      {c.minUnits ? (
        <Section title="Mínimo de producción">
          <div className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-3xl font-bold">{m.unitsConfirmed} de {c.minUnits}</span>
              <span className="text-sm text-muted">Cuenta prendas de pedidos con seña o pago aprobado</span>
            </div>
            <div className="mt-2"><Bar value={m.unitsConfirmed} max={c.minUnits} /></div>
            {c.minDecision ? (
              <p className="notice notice-info mt-4">
                Decisión registrada el {fmtDateTime(c.minDecisionAt!)}: <b>{MIN_DECISION_LABEL[c.minDecision]}</b>. {c.minDecisionNote}
              </p>
            ) : belowMin && windowEnded ? (
              <p className="notice notice-warn mt-4">La ventana cerró sin alcanzar el mínimo. El sistema no decide solo: registrá la decisión.</p>
            ) : null}
            {manage && belowMin && ["PUBLISHED", "CLOSED"].includes(c.status) && (
              <ActionForm action={minDecisionAction.bind(null, id)} className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="field">
                  <label htmlFor="decision">Decisión</label>
                  <select id="decision" name="decision" className="input" defaultValue="">
                    <option value="" disabled>Elegir</option>
                    {Object.entries(MIN_DECISION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="newCloseAt">Nuevo cierre (si extendés)</label><input id="newCloseAt" name="newCloseAt" type="datetime-local" className="input" defaultValue={toArLocal(addDays(new Date(), 7))} /></div>
                <div className="field md:col-span-2"><label htmlFor="note">Fundamento (queda registrado)</label><textarea id="note" name="note" className="input" rows={2} /></div>
                <p className="text-sm text-muted md:col-span-2">Cancelar no devuelve dinero automáticamente: cada devolución se registra en el pedido.</p>
                <SubmitButton className="btn btn-primary justify-self-start">Registrar decisión</SubmitButton>
              </ActionForm>
            )}
          </div>
        </Section>
      ) : null}

      <Section title="Distribución de prendas confirmadas">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card tbl-wrap">
            <table className="tbl"><thead><tr><th>Producto</th><th>Conf.</th><th>Solic.</th></tr></thead>
              <tbody>{m.byProduct.map((p) => <tr key={p.code}><td>{p.name}<div className="font-mono text-xs text-muted">{p.code}</div></td><td className="num">{p.confirmed}</td><td className="num">{p.requested}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="card tbl-wrap">
            <table className="tbl"><thead><tr><th>Prenda</th><th>Talle</th><th>Cant.</th></tr></thead>
              <tbody>{m.bySize.map((s) => <tr key={s.code + s.size}><td className="font-mono text-xs">{s.code}</td><td className="font-bold">{s.size}</td><td className="num">{s.qty}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="card tbl-wrap">
            <table className="tbl"><thead><tr><th>Deporte y categoría</th><th>Prendas</th></tr></thead>
              <tbody>{m.byCategory.map((s) => <tr key={s.label}><td>{s.label}</td><td className="num">{s.qty}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn btn-ghost btn-sm" href={`/api/admin/campanas/${id}/export?format=xlsx`}>Reporte comercial (Excel)</a>
          <a className="btn btn-ghost btn-sm" href={`/api/admin/campanas/${id}/export?format=csv`}>Reporte comercial (CSV)</a>
        </div>
      </Section>

      {(can(u, "production.view") || can(u, "lot.receive", c.clubId)) && (
        <Section
          title="Producción"
          actions={can(u, "production.plan") && windowEnded && !["CANCELLED", "DRAFT"].includes(c.status) && (
            <ActionForm action={generateLotAction.bind(null, id)} className="">
              <SubmitButton className="btn btn-primary" pendingText="Consolidando…">{c.lots.length ? "Generar lote de ajuste" : "Consolidar pedidos en un lote"}</SubmitButton>
            </ActionForm>
          )}
        >
          {c.lots.length === 0 ? (
            <p className="card p-5 text-muted">{windowEnded ? "Todavía no se consolidó ningún lote." : "El lote se genera al cerrar la ventana de compra."}</p>
          ) : (
            <div className="card tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Lote</th><th>Tipo</th><th>Movimientos</th><th>Estado</th><th>Creado</th></tr></thead>
                <tbody>
                  {c.lots.map((l) => (
                    <tr key={l.id}>
                      <td><Link href={`/admin/produccion/${l.id}`} className="font-semibold underline">Lote {l.number}</Link></td>
                      <td>{l.kind === "MAIN" ? "Principal" : "Ajuste"}</td>
                      <td className="num">{l._count.units}</td>
                      <td><Badge tone={l.status === "PENDING_APPROVAL" ? "warn" : "info"}>{LOT_STATUS_LABEL[l.status]}</Badge></td>
                      <td>{fmtDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {manage && (
            <ActionForm action={productionNoticeAction.bind(null, id)} className="card mt-4 grid gap-3 p-5">
              <div className="field">
                <label htmlFor="productionNotice">Aviso de avance para compradores</label>
                <textarea id="productionNotice" name="productionNotice" className="input" rows={2} defaultValue={c.productionNotice ?? ""} placeholder="Ej.: La tela llegó a fábrica; empezamos el corte la semana del 10/11." />
                <small>Se muestra en el seguimiento privado de cada pedido.</small>
              </div>
              <SubmitButton className="btn btn-ghost justify-self-start">Publicar aviso</SubmitButton>
            </ActionForm>
          )}
        </Section>
      )}

      {can(u, "benefit.view", c.clubId) && (
        <Section title="Beneficio del club">
          {!c.benefitRule && m.benefit.estimated === 0 ? (
            <p className="card p-5 text-muted">Esta campaña no tiene regla de beneficio.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Ventas confirmadas" value={<Money cents={m.salesConfirmed} />} />
                <Stat label="Beneficio estimado" value={<Money cents={m.benefit.estimated} />} hint={c.benefitRule ? (c.benefitRule.type === "FIXED_PER_UNIT" ? "Importe fijo por prenda" : `${(c.benefitRule.value / 100).toLocaleString("es-AR")} % sobre prendas`) : "Regla eliminada; se conserva lo fijado"} />
                <Stat label="Ajustes por cancelaciones" value={<Money cents={-m.benefit.adjustments} />} hint="Ya descontado del estimado" />
                <Stat label="Liquidado" value={<Money cents={m.benefit.settled} />} hint={<>Pendiente: <Money cents={Math.max(0, m.benefit.estimated - m.benefit.settled)} /></>} />
              </div>
              <p className="mt-2 text-sm text-muted">Registro comercial interno. No es dinero transferido automáticamente ni un reparto de pagos.</p>
              {c.settlements.length > 0 && (
                <div className="card tbl-wrap mt-3">
                  <table className="tbl"><thead><tr><th>Fecha</th><th>Importe</th><th>Referencia</th><th>Notas</th></tr></thead>
                    <tbody>{c.settlements.map((s) => <tr key={s.id}><td>{fmtDate(s.settledAt)}</td><td className="num"><Money cents={s.amount} /></td><td>{s.reference}</td><td>{s.notes}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              {can(u, "benefit.settle") && (
                <ActionForm action={settlementAction.bind(null, id)} className="card mt-3 grid gap-3 p-5 md:grid-cols-4 md:items-end" resetOnOk>
                  <div className="field"><label htmlFor="amount">Importe liquidado</label><input id="amount" name="amount" className="input" inputMode="decimal" /></div>
                  <div className="field"><label htmlFor="date">Fecha</label><input id="date" name="date" type="date" className="input" defaultValue={toArLocal(new Date()).slice(0, 10)} /></div>
                  <div className="field"><label htmlFor="reference">Referencia</label><input id="reference" name="reference" className="input" /></div>
                  <SubmitButton className="btn btn-primary">Registrar liquidación</SubmitButton>
                </ActionForm>
              )}
            </>
          )}
        </Section>
      )}
    </>
  );
}
