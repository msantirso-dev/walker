import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan, can, canReviewPayments } from "@/modules/auth";
import { orderById, paymentStateLabel, ORDER_STATUS_LABEL, DELIVERY_STATUS_LABEL } from "@/modules/orders";
import { PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/modules/payments";
import { LOT_STATUS_LABEL } from "@/modules/production";
import { ACTION_LABELS, history } from "@/modules/audit";
import { TEMPLATE_LABELS, type Template } from "@/modules/notifications";
import { db } from "@/shared/db";
import { fmtDateTime, fmtShortTime } from "@/shared/dates";
import { Badge, Money, PageHeader, Section, type Tone } from "@/shared/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/shared/ui/client";
import { cancelOrderAction, cancelUnitAction, manualPaymentAction, refundAction, reviewAction } from "../actions";

export const dynamic = "force-dynamic";
const payTone: Record<string, Tone> = { APPROVED: "ok", IN_REVIEW: "info", PENDING: "warn", REJECTED: "danger", REFUNDED: "info" };
const emailTone: Record<string, Tone> = { SENT: "ok", FAILED: "danger", NOT_SENT_NO_PROVIDER: "warn", QUEUED: "muted" };
const EMAIL_STATUS: Record<string, string> = { SENT: "Enviado", FAILED: "Falló", NOT_SENT_NO_PROVIDER: "No enviado: falta proveedor", QUEUED: "En cola" };

export default async function OrderAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const o = await orderById(id);
  if (!o) notFound();
  assertCan(u, "orders.view", o.clubId);
  const manage = can(u, "orders.manage", o.clubId);
  const review = canReviewPayments(u, o.clubId, o.campaign.paymentAccount.owner);
  const [log, emails, users] = await Promise.all([
    history("Order", id),
    db.emailOutbox.findMany({ where: { orderId: id }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const userName = new Map(users.map((x) => [x.id, x.name]));
  const balance = Math.max(0, o.total - o.paidAmount);
  const groups = [...o.players.map((p) => ({ p, units: o.units.filter((x) => x.playerId === p.id) })), { p: null, units: o.units.filter((x) => !x.playerId) }].filter((g) => g.units.length);

  return (
    <>
      <PageHeader
        eyebrow={`${o.club.name} · ${o.campaign.title}`}
        title={`Pedido ${o.code}`}
        actions={can(u, "deliveries.register", o.clubId) && o.status === "CONFIRMED" && <Link href={`/admin/entregas/${o.id}`} className="btn btn-primary">Entrega</Link>}
      >
        {fmtDateTime(o.createdAt)}
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Badge tone={o.status === "CONFIRMED" ? "ok" : o.status === "CANCELLED" ? "danger" : "warn"}>Pedido: {ORDER_STATUS_LABEL[o.status]}</Badge>
        <Badge tone={o.inReviewAmount ? "info" : o.paidAmount >= o.total ? "ok" : "muted"}>Pago: {paymentStateLabel(o)}</Badge>
        <Badge tone="info">Entrega: {DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Badge>
        {o.overCapacity && <Badge tone="danger">Pago aprobado fuera de cupo: requiere decisión</Badge>}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="text-xl font-bold">Comprador</h2>
          <dl className="mt-2 grid gap-1 text-sm">
            <div>{o.buyerName}</div>
            <div className="select-all">{o.buyerEmail}</div>
            <div className="select-all">{o.buyerPhone}</div>
            {o.memberNumber && <div>Socio N.º {o.memberNumber} <span className="text-muted">(declarado)</span></div>}
            <div>{o.deliveryMethod === "PICKUP" ? "Retira en sede" : `Envío a: ${o.shippingAddress}`}</div>
            {o.notes && <div className="text-muted">“{o.notes}”</div>}
          </dl>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-xl font-bold">Importes</h2>
          <dl className="num mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div><dt className="text-muted">Total</dt><dd className="text-lg font-bold"><Money cents={o.total} /></dd></div>
            <div><dt className="text-muted">Confirmado</dt><dd className="text-lg font-bold text-ok"><Money cents={o.paidAmount} /></dd></div>
            <div><dt className="text-muted">En revisión</dt><dd className="text-lg font-bold text-info"><Money cents={o.inReviewAmount} /></dd></div>
            <div><dt className="text-muted">Saldo</dt><dd className="text-lg font-bold"><Money cents={o.status === "CANCELLED" ? 0 : balance} /></dd></div>
            <div><dt className="text-muted">Seña requerida</dt><dd><Money cents={o.depositRequired} /></dd></div>
            <div><dt className="text-muted">Prendas</dt><dd><Money cents={o.itemsTotal} /></dd></div>
            <div><dt className="text-muted">Personalización</dt><dd><Money cents={o.persTotal} /></dd></div>
            <div><dt className="text-muted">Devuelto</dt><dd><Money cents={o.refundedAmount} /></dd></div>
          </dl>
          {o.status === "CANCELLED" && o.paidAmount > 0 && <p className="notice notice-warn mt-3">Pedido cancelado con <Money cents={o.paidAmount} /> cobrados: registrá la devolución cuando se realice.</p>}
        </div>
      </div>

      <Section title="Prendas por jugador">
        {groups.map((g) => (
          <div key={g.p?.id ?? "none"} className="card mt-3 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <b className="font-display text-xl uppercase">{g.p?.name ?? "Sin jugador"}</b>
              <span className="text-sm text-muted">{g.p ? [g.p.sport, g.p.category, g.p.team].filter(Boolean).join(" · ") : "Socio o hincha"}</span>
            </div>
            <div className="tbl-wrap mt-2">
              <table className="tbl">
                <thead><tr><th>Ref.</th><th>Producto</th><th>Talles</th><th>Personalización</th><th>Precio</th><th>Lote</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {g.units.map((x) => {
                    const inLot = x.lotUnits.reduce((a, l) => a + l.delta, 0) > 0 ? x.lotUnits.filter((l) => l.delta > 0).at(-1) : null;
                    return (
                      <tr key={x.id} className={x.status === "CANCELLED" ? "opacity-50" : ""}>
                        <td className="font-mono text-xs">{x.ref}</td>
                        <td>{x.productName}<div className="font-mono text-xs text-muted">{x.productCode}</div></td>
                        <td>{x.components.map((c) => `${c.label} ${c.sizeLabel}`).join(" + ")}</td>
                        <td>{x.persName || x.persNumber ? `${x.persName ?? "—"} #${x.persNumber ?? "—"}` : "—"}</td>
                        <td className="num"><Money cents={x.unitPrice + x.persPrice} /></td>
                        <td className="text-sm">{inLot ? `Lote ${inLot.lot.number} · ${LOT_STATUS_LABEL[inLot.lot.status]}` : "—"}</td>
                        <td>{x.status === "CANCELLED" ? <Badge tone="danger">Cancelada</Badge> : x.delivery ? <Badge tone="ok">Entregada</Badge> : <Badge>Activa</Badge>}</td>
                        <td>
                          {manage && x.status === "ACTIVE" && !x.deliveryId && o.status !== "CANCELLED" && (
                            <ConfirmAction label="Cancelar" confirmLabel="Cancelar esta unidad recalcula el total del pedido.">
                              <ActionForm action={cancelUnitAction.bind(null, o.id, x.id)} className="grid gap-2">
                                <input name="reason" className="input" placeholder="Motivo" aria-label="Motivo" />
                                <SubmitButton className="btn btn-danger btn-sm">Confirmar</SubmitButton>
                              </ActionForm>
                            </ConfirmAction>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Pagos y comprobantes">
        {o.payments.length === 0 ? <p className="card p-5 text-muted">Sin pagos registrados.</p> : (
          <div className="grid gap-3">
            {o.payments.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{PAYMENT_KIND_LABEL[p.kind]}</b> · {PAYMENT_METHOD_LABEL[p.method]} · <Money cents={p.amount} />
                    {p.simulated && <Badge tone="warn">Simulado</Badge>}
                    <div className="text-xs text-muted">
                      {fmtShortTime(p.createdAt)}
                      {p.operationRef && ` · Op. ${p.operationRef}`}
                      {p.providerPaymentId && ` · MP ${p.providerPaymentId}`}
                      {p.statusDetail && ` · ${p.statusDetail}`}
                      {p.reviewedById && ` · Revisó ${userName.get(p.reviewedById) ?? "usuario"} el ${fmtShortTime(p.reviewedAt!)}`}
                      {p.replacesPaymentId && " · Reemplaza un comprobante rechazado"}
                    </div>
                    {p.reviewNote && <div className="text-sm">{p.status === "REJECTED" ? "Motivo: " : "Nota: "}{p.reviewNote}</div>}
                  </div>
                  <Badge tone={payTone[p.status] ?? "muted"}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                </div>
                {p.receipts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.receipts.map((r) => (
                      <a key={r.id} href={`/api/comprobantes/${r.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Ver comprobante ({r.mime === "application/pdf" ? "PDF" : "imagen"})</a>
                    ))}
                  </div>
                )}
                {p.status === "IN_REVIEW" && review && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <ActionForm action={reviewAction.bind(null, o.id, p.id, true)} className="grid gap-2 rounded-lg bg-ok-bg p-3">
                      <div className="field"><label htmlFor={`amt-${p.id}`}>Importe acreditado (si difiere)</label><input id={`amt-${p.id}`} name="amount" className="input" inputMode="decimal" placeholder={String(p.amount / 100)} /></div>
                      <input name="note" className="input" placeholder="Nota (opcional)" aria-label="Nota" />
                      <SubmitButton className="btn btn-primary">Aprobar pago</SubmitButton>
                    </ActionForm>
                    <ActionForm action={reviewAction.bind(null, o.id, p.id, false)} className="grid gap-2 rounded-lg bg-danger-bg p-3">
                      <div className="field"><label htmlFor={`rej-${p.id}`}>Motivo del rechazo (se envía al comprador)</label><textarea id={`rej-${p.id}`} name="reason" className="input" rows={2} /></div>
                      <SubmitButton className="btn btn-danger">Rechazar comprobante</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {review && o.status !== "CANCELLED" && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {balance > 0 && (
              <details className="card p-4">
                <summary className="cursor-pointer font-bold">Registrar pago manual</summary>
                <ActionForm action={manualPaymentAction.bind(null, o.id)} className="mt-3 grid gap-3" resetOnOk>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="field"><label htmlFor="mp-amount">Importe</label><input id="mp-amount" name="amount" className="input" inputMode="decimal" defaultValue={String(balance / 100)} /></div>
                    <div className="field"><label htmlFor="mp-method">Medio</label><select id="mp-method" name="method" className="input"><option value="CASH">Efectivo en sede</option><option value="TRANSFER">Transferencia verificada</option></select></div>
                  </div>
                  <div className="field"><label htmlFor="mp-kind">Tipo</label><select id="mp-kind" name="kind" className="input" defaultValue={o.status === "CONFIRMED" ? "BALANCE" : "DEPOSIT"}><option value="DEPOSIT">Seña</option><option value="BALANCE">Saldo</option><option value="FULL">Pago total</option></select></div>
                  <input name="reference" className="input" placeholder="Referencia o recibo" aria-label="Referencia" />
                  <SubmitButton className="btn btn-primary justify-self-start">Registrar</SubmitButton>
                </ActionForm>
              </details>
            )}
            {o.paidAmount > 0 && (
              <details className="card p-4">
                <summary className="cursor-pointer font-bold">Registrar devolución realizada</summary>
                <ActionForm action={refundAction.bind(null, o.id)} className="mt-3 grid gap-3" resetOnOk>
                  <div className="field"><label htmlFor="rf-amount">Importe devuelto</label><input id="rf-amount" name="amount" className="input" inputMode="decimal" /></div>
                  <div className="field"><label htmlFor="rf-ref">Referencia de la devolución</label><input id="rf-ref" name="reference" className="input" /></div>
                  <input name="note" className="input" placeholder="Nota" aria-label="Nota" />
                  <p className="text-xs text-muted">Registra una devolución hecha por fuera del sistema. No mueve dinero.</p>
                  <SubmitButton className="btn btn-primary justify-self-start">Registrar devolución</SubmitButton>
                </ActionForm>
              </details>
            )}
          </div>
        )}
        {review && o.status === "CANCELLED" && o.paidAmount > 0 && (
          <details className="card mt-4 p-4" open>
            <summary className="cursor-pointer font-bold">Registrar devolución realizada</summary>
            <ActionForm action={refundAction.bind(null, o.id)} className="mt-3 grid gap-3" resetOnOk>
              <div className="field"><label htmlFor="rf2-amount">Importe devuelto</label><input id="rf2-amount" name="amount" className="input" inputMode="decimal" defaultValue={String(o.paidAmount / 100)} /></div>
              <div className="field"><label htmlFor="rf2-ref">Referencia</label><input id="rf2-ref" name="reference" className="input" /></div>
              <SubmitButton className="btn btn-primary justify-self-start">Registrar devolución</SubmitButton>
            </ActionForm>
          </details>
        )}
      </Section>

      {o.deliveries.length > 0 && (
        <Section title="Entregas">
          {o.deliveries.map((d) => (
            <div key={d.id} className="card mt-2 p-4 text-sm">
              {fmtDateTime(d.deliveredAt)} · {d.units.length} prenda(s) · Retiró <b>{d.receivedByName}</b>{d.receivedByNote && ` (${d.receivedByNote})`} · Registró {userName.get(d.deliveredById) ?? "usuario"}
              {d.balanceException && <div className="text-warn">Entregado con saldo pendiente. Motivo: {d.balanceException}</div>}
            </div>
          ))}
        </Section>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Section title="Historial">
          <ol className="card divide-y divide-line">
            {log.map((l) => (
              <li key={l.id} className="p-3 text-sm">
                <span className="text-muted">{fmtShortTime(l.createdAt)}</span> · <b>{ACTION_LABELS[l.action] ?? l.action}</b>
                <span className="text-muted"> · {l.actorId ? userName.get(l.actorId) ?? l.actorRole : l.actorRole === "BUYER" ? "Comprador" : l.actorRole === "PROVIDER" ? "Proveedor de pago" : "Sistema"}</span>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Correos">
          {emails.length === 0 ? <p className="card p-4 text-sm text-muted">Sin correos.</p> : (
            <ol className="card divide-y divide-line">
              {emails.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                  <span>{fmtShortTime(e.createdAt)} · {TEMPLATE_LABELS[e.template as Template] ?? e.template}</span>
                  <Badge tone={emailTone[e.status]}>{EMAIL_STATUS[e.status]}</Badge>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      {manage && !["CANCELLED"].includes(o.status) && o.deliveryStatus !== "DELIVERED" && (
        <div className="mt-8">
          <ConfirmAction label="Cancelar pedido" className="btn btn-ghost" confirmLabel="Cancela las prendas no entregadas. Los cobros no se devuelven solos: registrá la devolución después.">
            <ActionForm action={cancelOrderAction.bind(null, o.id)} className="grid gap-2">
              <input name="reason" className="input" placeholder="Motivo (se informa al comprador)" aria-label="Motivo" />
              <SubmitButton className="btn btn-danger">Confirmar cancelación</SubmitButton>
            </ActionForm>
          </ConfirmAction>
        </div>
      )}
    </>
  );
}
