import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan } from "@/modules/auth";
import { additionalPurchases, purchaseDebt, REASON_LABEL, debtBlockScope } from "@/modules/purchases";
import { DEBT_BLOCK_LABEL } from "@/modules/brand";
import { LOT_STATUS_LABEL } from "@/modules/production";
import { db } from "@/shared/db";
import { fmtDate, toArLocal } from "@/shared/dates";
import { Badge, Empty, Money, PageHeader } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { createAdditionalAction, purchasePaymentAction, purchaseStepAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compras adicionales del club" };

export default async function AdditionalPurchases({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const c = await db.campaign.findUnique({ where: { id }, include: { club: true, products: { where: { active: true }, include: { product: { select: { id: true, code: true, name: true } } }, orderBy: { sort: "asc" } } } });
  if (!c) notFound();
  assertCan(u, "campaign.view", c.clubId);
  const company = u.role === "TEXTIL_ADMIN";
  const list = await additionalPurchases(id);
  const scope = await debtBlockScope(c.clubId);
  const closed = c.closesAt <= new Date() || c.status !== "PUBLISHED";
  const today = toArLocal(new Date()).slice(0, 10);

  return (
    <>
      <PageHeader eyebrow={`${c.club.name} · ${c.title}`} title="Compras adicionales del club" actions={<Link href={`/admin/campanas/${id}`} className="btn btn-ghost">Volver a la campaña</Link>}>
        Unidades que el club compra después del cierre (ventas fuera de término, boutique, cambios de talle). Se negocian fuera de la web y las registra la empresa. No son ventas a socios. El club puede pagarlas hasta la entrega; impagas no se liberan. Bloqueo por deuda: {DEBT_BLOCK_LABEL[scope].toLowerCase()}.
      </PageHeader>

      {company && (
        <section className="card mb-6 p-5">
          <h2 className="text-xl font-bold">Registrar compra</h2>
          {!closed ? (
            <p className="mt-2 text-sm text-muted">Se registra después del cierre de la preventa ({fmtDate(c.closesAt)}).</p>
          ) : (
            <ActionForm action={createAdditionalAction.bind(null, id)} className="mt-3 grid gap-4" resetOnOk>
              <fieldset className="flex flex-wrap gap-4">
                <legend className="label mb-1">Motivos</legend>
                {Object.entries(REASON_LABEL).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name="reasons" value={k} /> {v}</label>
                ))}
              </fieldset>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Producto</th><th>Talle</th><th>Cantidad</th><th>Precio acordado por unidad ($)</th></tr></thead>
                  <tbody>
                    {Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}>
                        <td>
                          <select name={`p${i}`} className="input" aria-label={`Producto ${i + 1}`} defaultValue="">
                            <option value="">—</option>
                            {c.products.map((cp) => <option key={cp.productId} value={cp.productId}>{cp.product.code} {cp.product.name}</option>)}
                          </select>
                        </td>
                        <td><input name={`s${i}`} className="input w-24" aria-label={`Talle ${i + 1}`} /></td>
                        <td><input name={`q${i}`} type="number" min={0} className="input w-24" aria-label={`Cantidad ${i + 1}`} /></td>
                        <td><input name={`u${i}`} inputMode="decimal" className="input w-36" aria-label={`Precio ${i + 1}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="field"><label htmlFor="dueAt">Vencimiento del pago</label><input id="dueAt" name="dueAt" type="date" className="input" /></div>
                <div className="field"><label htmlFor="notes">Notas</label><input id="notes" name="notes" className="input" /></div>
              </div>
              <div><SubmitButton>Registrar compra</SubmitButton></div>
            </ActionForm>
          )}
        </section>
      )}

      {list.length === 0 ? (
        <Empty>Todavía no hay compras adicionales registradas.</Empty>
      ) : (
        <div className="grid gap-4">
          {list.map((p) => {
            const debt = purchaseDebt(p);
            const paid = p.payments.reduce((a, x) => a + x.amount, 0);
            const inLot = p.items.flatMap((it) => it.lotItems).map((l) => `Lote ${l.lot.number} (${LOT_STATUS_LABEL[l.lot.status]})`);
            return (
              <article key={p.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold">Compra {p.id.slice(-6).toUpperCase()}</h2>
                    <p className="text-sm text-muted">{fmtDate(p.createdAt)} · {p.reasons.map((r) => REASON_LABEL[r]).join(", ")}{p.dueAt ? ` · vence el ${fmtDate(p.dueAt)}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={p.approvedAt ? "ok" : "warn"}>{p.approvedAt ? "Aprobada" : "Sin aprobar"}</Badge>
                    <Badge tone={debt ? "danger" : "ok"}>{debt ? "Impaga" : "Pagada"}</Badge>
                    {inLot.length > 0 && <Badge tone="info">{[...new Set(inLot)].join(", ")}</Badge>}
                  </div>
                </div>
                <div className="tbl-wrap mt-3">
                  <table className="tbl">
                    <thead><tr><th>Producto</th><th>Talle</th><th>Cantidad</th><th>Precio</th></tr></thead>
                    <tbody>{p.items.map((it) => <tr key={it.id}><td>{it.product ? `${it.product.code} ${it.product.name}` : "—"}</td><td>{it.sizeLabel}</td><td>{it.quantity}</td><td>{it.unitPrice != null ? <Money cents={it.unitPrice} /> : "—"}</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm">Acordado <b><Money cents={p.agreedAmount ?? 0} /></b> · pagado <b><Money cents={paid} /></b> · pendiente <b><Money cents={debt} /></b></p>
                {p.payments.length > 0 && <ul className="mt-1 text-xs text-muted">{p.payments.map((x) => <li key={x.id}>{fmtDate(x.paidAt)} · <Money cents={x.amount} /> · {x.method}{x.reference ? ` · ${x.reference}` : ""}</li>)}</ul>}
                {company && (
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    {debt > 0 && (
                      <ActionForm action={purchasePaymentAction.bind(null, id, p.id)} className="flex flex-wrap items-end gap-2">
                        <div className="field"><label htmlFor={`a-${p.id}`}>Importe ($)</label><input id={`a-${p.id}`} name="amount" inputMode="decimal" className="input w-32" required /></div>
                        <div className="field"><label htmlFor={`d-${p.id}`}>Fecha</label><input id={`d-${p.id}`} name="paidAt" type="date" className="input" defaultValue={today} /></div>
                        <div className="field"><label htmlFor={`m-${p.id}`}>Medio</label><input id={`m-${p.id}`} name="method" className="input w-36" placeholder="Transferencia" required /></div>
                        <div className="field"><label htmlFor={`r-${p.id}`}>Referencia</label><input id={`r-${p.id}`} name="reference" className="input w-36" /></div>
                        <SubmitButton className="btn btn-ghost">Registrar pago</SubmitButton>
                      </ActionForm>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {!p.approvedAt && <ActionForm action={purchaseStepAction.bind(null, id, p.id, "approve")} className=""><SubmitButton className="btn btn-primary">Aprobar compra</SubmitButton></ActionForm>}
                      {p.approvedAt && p.items.some((it) => it.lotItems.reduce((a, l) => a + l.quantity, 0) < it.quantity) && (
                        <ActionForm action={purchaseStepAction.bind(null, id, p.id, "production")} className=""><SubmitButton className="btn btn-primary">Sumar a producción (revisión del lote)</SubmitButton></ActionForm>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
