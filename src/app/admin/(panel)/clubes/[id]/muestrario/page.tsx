import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan, can } from "@/modules/auth";
import { PURPOSE_LABEL, SAMPLE_AVAILABILITY_LABEL, SAMPLE_KIND_LABEL, SAMPLE_PUBLIC_TEXT, orderSizeReference } from "@/modules/samples";
import { db } from "@/shared/db";
import { fmtDate, toArLocal } from "@/shared/dates";
import { pesosInput } from "@/shared/money";
import { Badge, Empty, PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { approvePurchaseAction, linkAction, savePurchaseAction, saveSampleSetAction } from "./actions";

export const dynamic = "force-dynamic";

const sizesText = (items: { sizeLabel: string; quantity: number }[]) => items.map((i) => `${i.sizeLabel}:${i.quantity}`).join(", ");

export default async function SamplesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  assertCan(u, "samples.view", id);
  const manage = can(u, "samples.manage");
  const club = await db.club.findUnique({ where: { id } });
  if (!club) notFound();
  const [sets, products, garments, purchases, campaigns] = await Promise.all([
    db.sizeSampleSet.findMany({ where: { clubId: id }, orderBy: { createdAt: "asc" }, include: { items: { orderBy: { sort: "asc" } }, referenceGarment: true, productLinks: true } }),
    db.product.findMany({ where: { clubId: id, active: true }, orderBy: { code: "asc" } }),
    db.garment.findMany({ where: { clubId: id }, orderBy: { code: "asc" } }),
    db.clubPurchase.findMany({ where: { clubId: id }, orderBy: { createdAt: "desc" }, include: { items: true, product: true, campaign: true } }),
    db.campaign.findMany({ where: { clubId: id }, orderBy: { opensAt: "desc" }, select: { id: true, title: true } }),
  ]);
  const backupRefs = await Promise.all(purchases.filter((p) => p.purposes.includes("BACKUP") && p.productId).map(async (p) => [p.id, await orderSizeReference(p.productId!)] as const));
  const refOf = new Map(backupRefs);

  const SetForm = ({ s }: { s: (typeof sets)[number] | null }) => (
    <ActionForm action={saveSampleSetAction.bind(null, id, s?.id ?? null)} className="grid gap-3 md:grid-cols-3">
      <div className="field"><label htmlFor={`k-${s?.id ?? "n"}`}>Tipo</label><select id={`k-${s?.id ?? "n"}`} name="kind" className="input" defaultValue={s?.kind ?? "TOP"}>{Object.entries(SAMPLE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label htmlFor={`n-${s?.id ?? "n"}`}>Nombre</label><input id={`n-${s?.id ?? "n"}`} name="name" className="input" defaultValue={s?.name ?? ""} placeholder="Curva superior 1" /></div>
      <div className="field"><label htmlFor={`g-${s?.id ?? "n"}`}>Prenda de referencia</label><select id={`g-${s?.id ?? "n"}`} name="referenceGarmentId" className="input" defaultValue={s?.referenceGarmentId ?? ""}><option value="">—</option>{garments.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}</select></div>
      <div className="field md:col-span-2"><label htmlFor={`sz-${s?.id ?? "n"}`}>Talles y cantidades</label><input id={`sz-${s?.id ?? "n"}`} name="sizes" className="input" defaultValue={s ? sizesText(s.items) : ""} placeholder="S:1, M:1, L:1, XL:1" /></div>
      <div className="field"><label htmlFor={`d-${s?.id ?? "n"}`}>Entrega al club</label><input id={`d-${s?.id ?? "n"}`} name="deliveredAt" type="date" className="input" defaultValue={s?.deliveredAt ? toArLocal(s.deliveredAt).slice(0, 10) : ""} /></div>
      <div className="field"><label htmlFor={`a-${s?.id ?? "n"}`}>Disponibilidad</label><select id={`a-${s?.id ?? "n"}`} name="availability" className="input" defaultValue={s?.availability ?? "PENDING_DELIVERY"}>{Object.entries(SAMPLE_AVAILABILITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field md:col-span-2"><label htmlFor={`l-${s?.id ?? "n"}`}>Lugar de prueba</label><input id={`l-${s?.id ?? "n"}`} name="location" className="input" defaultValue={s?.location ?? ""} placeholder="Secretaría del club, martes y jueves 18 a 20 h" /></div>
      <div className="field md:col-span-2"><label htmlFor={`p-${s?.id ?? "n"}`}>Compra que lo originó (opcional)</label><select id={`p-${s?.id ?? "n"}`} name="purchaseId" className="input" defaultValue={s?.purchaseId ?? ""}><option value="">—</option>{purchases.filter((p) => p.purposes.includes("SAMPLE")).map((p) => <option key={p.id} value={p.id}>{p.purposes.map((x) => PURPOSE_LABEL[x]).join(" + ")} · {p.committedQty} u.</option>)}</select></div>
      <SubmitButton className="btn btn-primary self-end justify-self-start">{s ? "Guardar curva" : "Agregar curva"}</SubmitButton>
    </ActionForm>
  );

  const PurchaseForm = ({ p }: { p: (typeof purchases)[number] | null }) => (
    <ActionForm action={savePurchaseAction.bind(null, id, p?.id ?? null)} className="grid gap-3 md:grid-cols-3">
      <fieldset className="grid gap-1 md:col-span-3">
        <legend className="label">Función (marcá más de una solo si se confirmó que cumple ambas)</legend>
        <div className="flex flex-wrap gap-4">
          {Object.entries(PURPOSE_LABEL).map(([k, v]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name="purposes" value={k} defaultChecked={p?.purposes.includes(k as never)} className="h-5 w-5" /> {v}</label>)}
        </div>
      </fieldset>
      <div className="field"><label htmlFor={`pp-${p?.id ?? "n"}`}>Producto</label><select id={`pp-${p?.id ?? "n"}`} name="productId" className="input" defaultValue={p?.productId ?? ""}><option value="">—</option>{products.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></div>
      <div className="field"><label htmlFor={`pc-${p?.id ?? "n"}`}>Campaña</label><select id={`pc-${p?.id ?? "n"}`} name="campaignId" className="input" defaultValue={p?.campaignId ?? ""}><option value="">—</option>{campaigns.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></div>
      <div className="field"><label htmlFor={`pa-${p?.id ?? "n"}`}>Importe pagado (opcional)</label><input id={`pa-${p?.id ?? "n"}`} name="paidAmount" className="input" inputMode="decimal" defaultValue={pesosInput(p?.paidAmount ?? null)} /></div>
      <div className="field"><label htmlFor={`cq-${p?.id ?? "n"}`}>Unidades comprometidas</label><input id={`cq-${p?.id ?? "n"}`} name="committedQty" type="number" min={1} className="input" defaultValue={p?.committedQty ?? ""} /></div>
      <div className="field"><label htmlFor={`pq-${p?.id ?? "n"}`}>Unidades pagadas</label><input id={`pq-${p?.id ?? "n"}`} name="paidQty" type="number" min={0} className="input" defaultValue={p?.paidQty ?? 0} /></div>
      <div className="field"><label htmlFor={`ps-${p?.id ?? "n"}`}>Distribución de talles</label><input id={`ps-${p?.id ?? "n"}`} name="sizes" className="input" defaultValue={p ? sizesText(p.items) : ""} placeholder="S:3, M:5, L:5, XL:2" /><small>Manual. Queda “definida” si suma lo comprometido.</small></div>
      <div className="field md:col-span-3"><label htmlFor={`pn-${p?.id ?? "n"}`}>Notas</label><input id={`pn-${p?.id ?? "n"}`} name="notes" className="input" defaultValue={p?.notes ?? ""} /></div>
      <SubmitButton className="btn btn-primary justify-self-start">{p ? "Guardar compra" : "Registrar compra"}</SubmitButton>
    </ActionForm>
  );

  return (
    <>
      <PageHeader eyebrow={club.name} title="Muestrario y compras del club" actions={<Link href={`/admin/clubes/${id}`} className="btn btn-ghost">Volver al club</Link>}>
        Muestrario (probarse talles), compra inicial (habilita producción) y respaldo (cambios) son funciones distintas. La tienda muestra “{SAMPLE_PUBLIC_TEXT}” solo en productos con equivalencia aprobada y curva disponible.
      </PageHeader>

      <Section title="Curvas del muestrario">
        {sets.length === 0 && <Empty>Sin curvas cargadas.</Empty>}
        <div className="grid gap-3">
          {sets.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{s.name} <span className="text-sm font-normal text-muted">· {SAMPLE_KIND_LABEL[s.kind]}{s.referenceGarment ? ` · ref. ${s.referenceGarment.code}` : ""}</span></b>
                <Badge tone={s.availability === "AVAILABLE" ? "ok" : "warn"}>{SAMPLE_AVAILABILITY_LABEL[s.availability]}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">Talles: {sizesText(s.items)}{s.deliveredAt ? ` · entregada ${fmtDate(s.deliveredAt)}` : ""}{s.location ? ` · ${s.location}` : ""}</p>
              <div className="mt-3">
                <div className="label mb-1">Equivalencia por producto (la aprueba la empresa)</div>
                <div className="flex flex-wrap gap-2">
                  {products.map((p) => {
                    const link = s.productLinks.find((l) => l.productId === p.id);
                    return manage ? (
                      <ActionForm key={p.id} action={linkAction.bind(null, id, p.id, s.id, !link?.approved)} className="">
                        <SubmitButton className={`btn btn-sm ${link?.approved ? "btn-primary" : "btn-ghost"}`} pendingText="…">{link?.approved ? "✓ " : ""}{p.code}</SubmitButton>
                      </ActionForm>
                    ) : link?.approved ? <Badge key={p.id} tone="ok">{p.code}</Badge> : null;
                  })}
                </div>
              </div>
              {manage && <details className="mt-3"><summary className="btn btn-ghost btn-sm">Editar curva</summary><div className="mt-3"><SetForm s={s} /></div></details>}
            </div>
          ))}
        </div>
        {manage && <details className="card mt-3 p-4"><summary className="cursor-pointer font-bold">Agregar curva</summary><div className="mt-3"><SetForm s={null} /></div></details>}
      </Section>

      <Section title="Compras del club">
        {purchases.length === 0 && <Empty>Sin compras registradas.</Empty>}
        <div className="grid gap-3">
          {purchases.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{p.purposes.map((x) => PURPOSE_LABEL[x]).join(" + ")} <span className="text-sm font-normal text-muted">· {p.product ? p.product.name : "sin producto"}{p.campaign ? ` · ${p.campaign.title}` : ""}</span></b>
                <span className="flex flex-wrap gap-1">
                  <Badge tone="muted">{p.paidQty} de {p.committedQty} pagadas</Badge>
                  <Badge tone={p.sizeStatus === "DEFINED" ? "ok" : "warn"}>{p.sizeStatus === "DEFINED" ? "Talles definidos" : "Talles pendientes"}</Badge>
                  <Badge tone={p.approvedAt ? "ok" : "warn"}>{p.approvedAt ? "Aprobada" : "Sin aprobar"}</Badge>
                </span>
              </div>
              {p.items.length > 0 && <p className="mt-1 text-sm text-muted">Talles: {sizesText(p.items)}</p>}
              {refOf.get(p.id)?.length ? (
                <p className="mt-1 text-xs text-muted">Referencia para el respaldo (pedidos confirmados): {refOf.get(p.id)!.map((r) => `${r.garment} ${r.size}: ${r.qty}`).join(" · ")}. La distribución del respaldo se define a mano.</p>
              ) : null}
              {manage && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!p.approvedAt && p.sizeStatus === "DEFINED" && <ActionForm action={approvePurchaseAction.bind(null, id, p.id)} className=""><SubmitButton className="btn btn-primary btn-sm">Aprobar compra</SubmitButton></ActionForm>}
                  <details><summary className="btn btn-ghost btn-sm">Editar</summary><div className="mt-3"><PurchaseForm p={p} /></div></details>
                </div>
              )}
            </div>
          ))}
        </div>
        {manage && <details className="card mt-3 p-4"><summary className="cursor-pointer font-bold">Registrar compra</summary><div className="mt-3"><PurchaseForm p={null} /></div></details>}
      </Section>
    </>
  );
}
