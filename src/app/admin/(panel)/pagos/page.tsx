import Link from "next/link";
import { requireUser, assertCan, canReviewPayments, clubScope } from "@/modules/auth";
import { PAYMENT_KIND_LABEL } from "@/modules/payments";
import { db } from "@/shared/db";
import { fmtShortTime } from "@/shared/dates";
import { Empty, Money, PageHeader } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { reviewAction } from "../pedidos/actions";

export const dynamic = "force-dynamic";

export default async function Reviews() {
  const u = await requireUser();
  assertCan(u, "payments.review");
  const all = await db.payment.findMany({
    where: { status: "IN_REVIEW", order: clubScope(u) },
    orderBy: { createdAt: "asc" },
    include: { receipts: true, order: { include: { club: true, campaign: { include: { paymentAccount: true } } } } },
  });
  const list = all.filter((p) => canReviewPayments(u, p.order.clubId, p.order.campaign.paymentAccount.owner));
  const others = all.length - list.length;
  return (
    <>
      <PageHeader eyebrow="Cobros" title="Revisión de pagos">
        Un comprobante no confirma el pago hasta que lo aprobás. Al rechazar, el comprador recibe el motivo y puede subir otro.
      </PageHeader>
      {others > 0 && <p className="notice notice-info mb-4">{others} comprobante(s) los revisa la textil porque es la destinataria de los cobros.</p>}
      {list.length === 0 ? <Empty>No hay comprobantes pendientes.</Empty> : (
        <div className="grid gap-4">
          {list.map((p) => (
            <div key={p.id} className="card grid gap-4 p-4 lg:grid-cols-[1.2fr_1fr_1fr]">
              <div>
                <div className="eyebrow">{p.order.club.name} · {p.order.campaign.title}</div>
                <Link href={`/admin/pedidos/${p.orderId}`} className="font-mono text-lg font-bold underline">{p.order.code}</Link>
                <div>{p.order.buyerName}</div>
                <div className="mt-1 text-sm">{PAYMENT_KIND_LABEL[p.kind]} declarado: <b><Money cents={p.amount} /></b> · Op. <span className="font-mono">{p.operationRef}</span></div>
                <div className="text-xs text-muted">Cargado el {fmtShortTime(p.createdAt)}{p.replacesPaymentId && " · reemplaza uno rechazado"}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.receipts.map((r) => <a key={r.id} className="btn btn-ghost btn-sm" href={`/api/comprobantes/${r.id}`} target="_blank" rel="noopener noreferrer">Ver comprobante</a>)}
                </div>
                <p className="mt-2 text-xs text-muted">Verificá la acreditación en la cuenta {p.order.campaign.paymentAccount.label} antes de aprobar.</p>
              </div>
              <ActionForm action={reviewAction.bind(null, p.orderId, p.id, true)} className="grid content-start gap-2 rounded-lg bg-ok-bg p-3">
                <div className="field"><label htmlFor={`a-${p.id}`}>Importe acreditado</label><input id={`a-${p.id}`} name="amount" className="input" inputMode="decimal" defaultValue={String(p.amount / 100)} /></div>
                <input name="note" className="input" placeholder="Nota (opcional)" aria-label="Nota" />
                <SubmitButton className="btn btn-primary">Aprobar</SubmitButton>
              </ActionForm>
              <ActionForm action={reviewAction.bind(null, p.orderId, p.id, false)} className="grid content-start gap-2 rounded-lg bg-danger-bg p-3">
                <div className="field"><label htmlFor={`r-${p.id}`}>Motivo del rechazo</label><textarea id={`r-${p.id}`} name="reason" className="input" rows={3} placeholder="Ej.: el importe no coincide; el comprobante no es legible" /></div>
                <SubmitButton className="btn btn-danger">Rechazar</SubmitButton>
              </ActionForm>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
