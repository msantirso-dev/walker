import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { orderByToken, paymentStateLabel, ORDER_STATUS_LABEL, DELIVERY_STATUS_LABEL } from "@/modules/orders";
import { advanceStates, dueOptions, onlineMode, PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, RECEIVER_LABEL } from "@/modules/payments";
import { MP_FINANCING_TEXT } from "@/shared/copy";
import { DemoBanner } from "@/app/club/_ui/parts";
import { LOT_PUBLIC_LABEL } from "@/modules/production";
import { clubTheme } from "@/modules/clubs/public";
import { pickupQrPayload } from "@/modules/deliveries";
import { addDays, fmtDate, fmtDateTime, fmtShortTime } from "@/shared/dates";
import { ars } from "@/shared/money";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { Badge, type Tone } from "@/shared/ui";
import { ClubBar, waLink } from "@/app/club/_ui/parts";
import { payOnline, uploadTransfer } from "./actions";
import { Refresher } from "./refresher";
import type { LotStatus } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tu pedido", robots: { index: false, follow: false } };

const toneFor: Record<string, Tone> = { CONFIRMED: "ok", PENDING_PAYMENT: "warn", CANCELLED: "danger", EXPIRED: "muted" };
const payTone: Record<string, Tone> = { APPROVED: "ok", IN_REVIEW: "info", PENDING: "warn", CREATED: "muted", REJECTED: "danger", CANCELLED: "muted", EXPIRED: "muted", REFUNDED: "info" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const o = await orderByToken(token);
  if (!o) notFound();
  const c = o.campaign;
  const club = o.club;
  const adv = o.pricingModel === "TEXTIL_ADVANCE";
  const st = adv ? advanceStates(o) : null;
  // Con anticipo textil, lo que queda es el saldo con el club (no se paga por la plataforma)
  const balance = adv ? st!.clubDue : Math.max(0, o.total - o.paidAmount);
  const options = dueOptions(o, c);
  const mpMode = onlineMode(c.paymentAccount);
  const mpEnabled = c.allowMercadoPago && mpMode !== "unavailable";
  const lastTransfer = [...o.payments].reverse().find((p) => p.method === "TRANSFER");
  const waitingProvider = o.payments.some((p) => p.method === "MERCADOPAGO" && ["CREATED", "PENDING"].includes(p.status) && Date.now() - p.createdAt.getTime() < 60 * 60_000);
  const activeUnits = o.units.filter((u) => u.status === "ACTIVE");

  // Avance de fabricación publicado: el estado más atrasado entre los lotes que contienen sus prendas
  const ORDER: LotStatus[] = ["PENDING_APPROVAL", "APPROVED", "IN_PRODUCTION", "QUALITY_CONTROL", "READY_TO_SHIP", "RECEIVED_BY_CLUB"];
  const lotStates = activeUnits.flatMap((u) => u.lotUnits.filter((lu) => lu.delta > 0 && lu.lot.status !== "PENDING_APPROVAL").map((lu) => lu.lot.status));
  const production =
    o.status !== "CONFIRMED" ? "Se fabrica cuando el pedido está confirmado" : lotStates.length ? LOT_PUBLIC_LABEL[lotStates.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0]] : "A la espera del cierre de la preventa";
  const eta = `${fmtDate(addDays(c.closesAt, c.deliveryDaysMin))} al ${fmtDate(addDays(c.closesAt, c.deliveryDaysMax))}`;
  const ready = o.deliveryStatus === "READY" || o.deliveryStatus === "PARTIAL";
  const qr = ready ? await QRCode.toString(pickupQrPayload(o.pickupCode), { type: "svg", margin: 1, width: 220 }) : null;
  const playerGroups = [...o.players.map((p) => ({ p, units: activeUnits.filter((u) => u.playerId === p.id) })), { p: null, units: activeUnits.filter((u) => !u.playerId) }].filter((g) => g.units.length);

  return (
    <div style={clubTheme(club)} className="min-h-dvh">
      {club.isDemo && <DemoBanner />}
      <header className="bg-club text-on-club">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <ClubBar club={club} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {sp.nuevo && (
          <div className="notice notice-ok mb-4">
            <b>Pedido registrado.</b> Guardá este enlace: es privado y te permite {adv ? "pagar el anticipo" : "pagar la seña, después el saldo,"} y ver el avance. También te lo enviamos por correo.
          </div>
        )}
        {sp.pago === "error" && <div className="notice notice-warn mb-4">No pudimos abrir Mercado Pago. Tu pedido está guardado: intentá de nuevo con el botón de pago.</div>}
        {sp.retorno && <div className="mb-4"><Refresher active={waitingProvider && o.status !== "CONFIRMED"} /></div>}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">{c.title}</div>
            <h1 className="text-5xl font-extrabold">Pedido <span className="font-mono text-4xl tracking-wider">{o.code}</span></h1>
            <p className="mt-1 text-muted">Hecho el {fmtDateTime(o.createdAt)} por {o.buyerName}</p>
          </div>
        </div>

        <dl className={`mt-6 grid grid-cols-2 gap-3 ${adv ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
          {[
            ["Pedido", <Badge key="o" tone={toneFor[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>],
            ...(adv
              ? [
                  ["Anticipo", <Badge key="a" tone={st!.advanceOk ? "ok" : "warn"}>{st!.advance}</Badge>],
                  ["Saldo al club", <Badge key="c" tone={st!.clubDue > 0 ? "warn" : "ok"}>{st!.club}</Badge>],
                ]
              : [["Pago", <Badge key="p" tone={o.paidAmount >= o.total ? "ok" : o.paidAmount > 0 ? "info" : "warn"}>{paymentStateLabel(o)}</Badge>]]),
            ["Fabricación", <span key="f" className="font-semibold">{production}</span>],
            ["Entrega", <span key="e" className="font-semibold">{o.status !== "CONFIRMED" ? "—" : adv ? (ready ? "En el club, listo para retirar" : "Se entrega en el club") : DELIVERY_STATUS_LABEL[o.deliveryStatus]}</span>],
          ].map(([k, v]) => (
            <div key={k as string} className="card p-3">
              <dt className="eyebrow">{k}</dt>
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="card mt-6 p-5">
          <h2 className="text-2xl font-bold">Importes</h2>
          <dl className="num mt-3 grid gap-1.5">
            <div className="flex justify-between"><dt>Prendas</dt><dd>{ars(o.itemsTotal)}</dd></div>
            {o.persTotal > 0 && <div className="flex justify-between"><dt>Personalización y adicionales</dt><dd>{ars(o.persTotal)}</dd></div>}
            {o.shippingTotal > 0 && <div className="flex justify-between"><dt>Envío</dt><dd>{ars(o.shippingTotal)}</dd></div>}
            <div className="flex justify-between border-t-2 border-ink pt-2 text-lg font-bold"><dt>Total</dt><dd>{ars(o.total)}</dd></div>
            {adv ? (
              <>
                <div className="flex justify-between"><dt>Anticipo (Mercado Pago · lo cobra la textil)</dt><dd>{ars(o.advanceRequired)}</dd></div>
                <div className="flex justify-between text-ok"><dt>Anticipo acreditado</dt><dd>{ars(o.advancePaid)}</dd></div>
                <div className="flex justify-between"><dt>Saldo al club (lo cobra {club.name})</dt><dd>{ars(o.clubBalanceRequired)}</dd></div>
              </>
            ) : (
              <div className="flex justify-between text-ok"><dt>Confirmado</dt><dd>{ars(o.paidAmount)}</dd></div>
            )}
            {o.inReviewAmount > 0 && <div className="flex justify-between text-info"><dt>En revisión (no descuenta saldo)</dt><dd>{ars(o.inReviewAmount)}</dd></div>}
            {o.refundedAmount > 0 && <div className="flex justify-between"><dt>Devuelto</dt><dd>{ars(o.refundedAmount)}</dd></div>}
            <div className="flex justify-between text-lg font-bold"><dt>{adv ? "Saldo a pagar al club" : "Saldo adeudado"}</dt><dd>{ars(o.status === "CANCELLED" ? 0 : balance)}</dd></div>
          </dl>
          {adv && o.status === "CONFIRMED" && balance > 0 && (
            <p className="notice notice-info mt-3 text-sm">
              El saldo se paga directamente a {club.name}{club.pickupAddress ? ` (${club.pickupAddress})` : ""}{club.officeHours ? `, ${club.officeHours}` : ""}. No se paga por esta página. Es necesario para retirar las prendas.
            </p>
          )}
          {o.status === "PENDING_PAYMENT" && o.reservedUntil && (
            <p className="mt-3 text-sm text-muted">
              Para confirmar, pagá {adv ? "el anticipo de " : ""}{ars(Math.max(0, adv ? o.advanceRequired - o.advancePaid : o.depositRequired - o.paidAmount))}. Reserva vigente hasta el {fmtDateTime(o.reservedUntil)}.
            </p>
          )}
          {o.status === "EXPIRED" && <p className="notice notice-warn mt-3">La reserva venció sin pago. Si la preventa sigue abierta y hay cupo, podés pagar ahora y se reactiva el mismo pedido.</p>}
          {o.status === "CANCELLED" && <p className="notice notice-danger mt-3">Pedido cancelado{o.cancelReason ? `: ${o.cancelReason}` : ""}. {o.paidAmount > 0 ? "El club o la fábrica coordinan con vos la devolución de lo pagado." : ""}</p>}
        </section>

        {options.length > 0 && (
          <section className="card mt-6 p-5">
            <h2 className="text-2xl font-bold">{adv ? "Pagar el anticipo" : o.status === "CONFIRMED" ? "Pagar el saldo" : "Pagar para confirmar"}</h2>
            {o.inReviewAmount > 0 ? (
              <p className="notice notice-info mt-3">Tu comprobante está en revisión. Te avisamos por correo cuando se apruebe.</p>
            ) : (
              <div className="mt-4 grid gap-6">
                {mpEnabled && (
                  <div>
                    <h3 className="text-lg font-bold">Mercado Pago</h3>
                    {mpMode === "simulator" && <p className="mb-2 text-sm text-warn">Entorno de prueba: el pago es simulado.</p>}
                    <p className="text-sm text-muted">{MP_FINANCING_TEXT}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {options.map((op) => (
                        <ActionForm key={op.kind} action={payOnline.bind(null, token, op.kind)} className="grid gap-2">
                          <SubmitButton className="btn btn-club" pendingText="Abriendo Mercado Pago…">
                            {op.kind === "ADVANCE" ? "Pagar el anticipo" : op.kind === "DEPOSIT" ? "Pagar la seña" : op.kind === "BALANCE" ? "Pagar el saldo" : "Pagar el total"} · {ars(op.amount)}
                          </SubmitButton>
                        </ActionForm>
                      ))}
                    </div>
                  </div>
                )}
                {c.allowTransfer && (
                  <div>
                    <h3 className="text-lg font-bold">Transferencia bancaria</h3>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-3 text-sm">
                      <dt className="text-muted">Titular</dt><dd className="font-semibold">{c.paymentAccount.bankHolder}</dd>
                      <dt className="text-muted">Banco</dt><dd className="font-semibold">{c.paymentAccount.bankName}</dd>
                      <dt className="text-muted">CBU</dt><dd className="select-all break-all font-mono">{c.paymentAccount.bankCbu}</dd>
                      <dt className="text-muted">Alias</dt><dd className="select-all font-mono">{c.paymentAccount.bankAlias}</dd>
                      {c.paymentAccount.bankCuit && (<><dt className="text-muted">CUIT</dt><dd className="font-mono">{c.paymentAccount.bankCuit}</dd></>)}
                      <dt className="text-muted">Importe</dt><dd className="font-semibold">{options.map((op) => `${op.label}: ${ars(op.amount)}`).join(" · ")}</dd>
                    </dl>
                    {lastTransfer?.status === "REJECTED" && (
                      <p className="notice notice-danger mt-3">Tu último comprobante fue rechazado: {lastTransfer.reviewNote}. Podés subir uno nuevo.</p>
                    )}
                    <ActionForm action={uploadTransfer.bind(null, token, options[0].kind)} className="mt-3 grid gap-3" resetOnOk>
                      {options.length > 1 && <p className="text-sm text-muted">Transferí la seña o el total; el club registra el importe acreditado al revisarlo.</p>}
                      <div className="field">
                        <label htmlFor="operationRef">Número de operación</label>
                        <input id="operationRef" name="operationRef" className="input" required minLength={3} maxLength={60} />
                      </div>
                      <div className="field">
                        <label htmlFor="receipt">Comprobante</label>
                        <input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="text-sm" />
                        <small>Imagen o PDF, hasta 8 MB.</small>
                      </div>
                      <SubmitButton className="btn btn-ghost justify-self-start" pendingText="Subiendo…">Enviar comprobante</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {ready && qr && (
          <section className="card mt-6 grid gap-5 p-5 md:grid-cols-[auto_1fr]">
            <div className="mx-auto rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} aria-label="Código QR de retiro" role="img" />
            <div>
              <h2 className="text-2xl font-bold">Retiro en el club</h2>
              <p className="mt-1">Código de retiro: <span className="select-all font-mono text-lg font-bold tracking-widest">{o.pickupCode}</span></p>
              <p className="mt-2 text-muted">{[club.pickupAddress, club.pickupHours, c.pickupInstructions].filter(Boolean).join(". ")}</p>
              {balance > 0 && <p className="notice notice-warn mt-3">{adv ? `El retiro se realiza solo contra pago total: pagá al club el saldo de ${ars(balance)}. Lo cobra el club.` : `Antes de retirar, completá el saldo de ${ars(balance)}.`}</p>}
              {adv && <p className="mt-2 text-sm text-muted">Desde acá, el retiro y el cobro del saldo los gestiona {club.name}.</p>}
              <p className="mt-2 text-xs text-muted">El código no contiene datos personales. Mostralo en la sede.</p>
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-3xl font-bold">Prendas</h2>
          {playerGroups.map((g) => (
            <div key={g.p?.id ?? "none"} className="card mt-3 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <b className="font-display text-xl uppercase">{g.p?.name ?? "Sin jugador asociado"}</b>
                <span className="text-sm text-muted">{g.p ? [g.p.sport, g.p.category, g.p.team].filter(Boolean).join(" · ") : "Socio o hincha"}</span>
              </div>
              <ul className="mt-2 divide-y divide-dashed divide-line">
                {g.units.map((u) => (
                  <li key={u.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <div>
                      <div className="font-semibold">{u.productName}</div>
                      <div className="text-sm text-muted">
                        {u.components.map((cmp) => `${u.components.length > 1 ? cmp.label : "Talle"} ${cmp.sizeLabel}`).join(" · ")}
                        {u.options.length
                          ? ` · ${u.options.map((op) => `${op.groupName}: ${op.value}`).join(" · ")}`
                          : (u.persName || u.persNumber) && ` · ${u.persName ?? "Sin nombre"} ${u.persNumber ? `#${u.persNumber}` : ""}`}
                      </div>
                      {u.noSizeChange && <div className="text-xs font-semibold">Personalizada: sin cambio de talle</div>}
                    </div>
                    <div className="text-right">
                      <div className="num font-semibold">{ars(u.unitPrice + u.persPrice)}</div>
                      {u.delivery && <div className="text-xs text-ok">Entregada el {fmtShortTime(u.delivery.deliveredAt)}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-3 text-sm text-muted">Entrega estimada: del {eta}. {c.productionNotice}</p>
        </section>

        {o.payments.length > 0 && (
          <section className="mt-8">
            <h2 className="text-3xl font-bold">Pagos y comprobantes</h2>
            <div className="card tbl-wrap mt-3">
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Medio</th><th>Cobra</th><th>Importe</th><th>Estado</th></tr></thead>
                <tbody>
                  {o.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtShortTime(p.createdAt)}</td>
                      <td>{PAYMENT_KIND_LABEL[p.kind]}</td>
                      <td>
                        {PAYMENT_METHOD_LABEL[p.method]}
                        {p.simulated && <span className="badge badge-warn ml-1">Simulado</span>}
                        {p.receipts.map((r) => (
                          <a key={r.id} className="ml-2 text-sm underline" href={`/api/comprobantes/${r.id}?t=${token}`} target="_blank" rel="noopener noreferrer">comprobante</a>
                        ))}
                        {p.operationRef && <div className="text-xs text-muted">Op. {p.operationRef}</div>}
                      </td>
                      <td>{p.receiver === "CLUB" ? club.name : RECEIVER_LABEL[p.receiver]}</td>
                      <td className="num">{ars(p.amount)}</td>
                      <td>
                        <Badge tone={payTone[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                        {p.status === "REJECTED" && p.reviewNote && <div className="text-xs text-danger">{p.reviewNote}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {o.deliveries.length > 0 && (
          <section className="mt-8">
            <h2 className="text-3xl font-bold">Entregas</h2>
            {o.deliveries.map((d) => (
              <p key={d.id} className="card mt-3 p-4">
                {fmtDateTime(d.deliveredAt)}: {d.units.length} prenda(s), retiró {d.receivedByName}.
              </p>
            ))}
          </section>
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <details className="card p-4">
            <summary className="cursor-pointer font-bold">Condiciones aceptadas</summary>
            <p className="mt-2 text-sm text-muted">Aceptadas el {fmtDateTime(o.termsAcceptedAt)}. Se conservan tal como estaban al comprar.</p>
            <TermsView terms={o.termsSnapshot as Record<string, unknown>} />
          </details>
          <div className="card p-4">
            <div className="font-bold">¿Dudas?</div>
            {club.whatsapp ? (
              <a className="btn btn-club mt-3" href={waLink(club.whatsapp, `Hola, consulto por mi pedido ${o.code} de ${c.title}.`)} target="_blank" rel="noopener noreferrer">
                Consultar al club por WhatsApp
              </a>
            ) : (
              club.email && <p className="mt-2">Escribí a <span className="select-all font-semibold">{club.email}</span> indicando el pedido {o.code}.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function TermsView({ terms }: { terms: Record<string, unknown> }) {
  const pol = (terms.policies ?? {}) as Record<string, string | null>;
  const cp = (terms.changePolicy ?? null) as { personalized?: string; other?: string } | null;
  const rows: [string, unknown][] = [
    ["Pagos", terms.payments],
    ["Prendas personalizadas", cp?.personalized],
    ["Prendas sin personalizar", cp?.other],
    ["Cambios", pol.changes],
    ["Cancelación", pol.cancellation],
    ["Devoluciones", pol.refunds],
    ["Mínimo de producción", terms.minPolicy],
    ["Saldo", terms.balanceDue],
    ["Condiciones del club", terms.clubConditions],
  ];
  return (
    <dl className="mt-2 grid gap-2 text-sm">
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted">{String(v)}</dd></div>
      ))}
    </dl>
  );
}
