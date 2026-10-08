import { advanceUnit } from "@/shared/advance";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan, can } from "@/modules/auth";
import { RULE_LABEL, AUDIENCE_LABEL, OUTFIT_INITIAL_PURCHASE_DEFAULT, OUTFIT_BACKUP_SUGGESTION, productionRuleStatus, CAMPAIGN_STATUS_LABEL } from "@/modules/campaigns";
import { PURPOSE_LABEL } from "@/modules/samples";
import { Badge, Money } from "@/shared/ui";
import { db } from "@/shared/db";
import { toArLocal } from "@/shared/dates";
import { pesosInput } from "@/shared/money";
import { PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { onlineMode } from "@/modules/payments";
import { BENEFIT_TYPE_LABEL } from "@/modules/benefits";
import { updateCampaign, saveCollection, saveBenefit, saveRuleAction, approveRuleAction, audienceAction, commitShortfallAction, shortfallPurchaseAction } from "../../actions";

export const dynamic = "force-dynamic";

function T({ name, label, value, hint, rows = 2 }: { name: string; label: string; value?: string | null; hint?: string; rows?: number }) {
  return (
    <div className="field md:col-span-2">
      <label htmlFor={name}>{label}</label>
      <textarea id={name} name={name} className="input" rows={rows} defaultValue={value ?? ""} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

export default async function EditCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const c = await db.campaign.findUnique({
    where: { id },
    include: {
      club: { include: { sports: { include: { sport: true } }, categories: { where: { active: true }, orderBy: { sort: "asc" }, include: { sport: true } } } },
      benefitRule: true, audienceSports: true, audienceCategories: true,
      products: { orderBy: { sort: "asc" }, include: { product: true, ruleCategory: true, clubPurchase: true } },
    },
  });
  if (!c) notFound();
  const textil = can(u, "campaign.manage");
  if (!textil) assertCan(u, "campaign.request", c.clubId);
  const advance = c.pricingModel === "TEXTIL_ADVANCE";
  const editable = ["DRAFT", "ACTIVATION_REQUESTED", "ACTIVATION_APPROVED"].includes(c.status);
  const [rules, purchases] = await Promise.all([
    productionRuleStatus(id),
    db.clubPurchase.findMany({ where: { clubId: c.clubId, purposes: { has: "INITIAL" } }, orderBy: { createdAt: "desc" } }),
  ]);
  const ruleOf = new Map(rules.map((r) => [r.id, r]));
  const [accounts, catalog] = await Promise.all([
    db.paymentAccount.findMany({ where: { OR: [{ owner: "TEXTIL" }, { clubId: c.clubId }] }, orderBy: { label: "asc" } }),
    db.product.findMany({ where: { clubId: c.clubId, active: true, ...(textil ? {} : { catalogStatus: { in: ["CATALOG", "PRESALE", "PRESALE_CLOSED"] } }) }, orderBy: { code: "asc" } }),
  ]);
  const faq = ((c.faq as { q: string; a: string }[] | null) ?? []).map((f) => `${f.q} | ${f.a}`).join("\n");
  const available = catalog.filter((p) => !c.products.some((x) => x.productId === p.id));
  const accountNotes = accounts.map((a) => `${a.label}: ${onlineMode(a) === "mercadopago" ? "Mercado Pago con credenciales" : onlineMode(a) === "simulator" ? "Mercado Pago simulado (faltan credenciales)" : "Mercado Pago sin credenciales"}`);

  return (
    <>
      <PageHeader eyebrow={c.club.name} title={`Configurar · ${c.title}`} actions={<Link href={`/admin/campanas/${id}`} className="btn btn-ghost">Volver a la campaña</Link>} />

      <p className="mb-4 flex flex-wrap gap-2">
        <Badge tone="info">{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
        <Badge tone="muted">{advance ? "Modelo: anticipo textil + saldo al club" : "Modelo: seña (anterior)"}</Badge>
        {!editable && advance && <Badge tone="warn">Publicada: precios y reglas bloqueados</Badge>}
      </p>

      <Section title="Colección y precios">
        <ActionForm action={saveCollection.bind(null, id)} className="grid gap-4">
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Producto</th>
                  {advance && <th>Precio textil (anticipo)</th>}
                  <th>{advance ? "Precio al socio" : "Precio preventa"}</th>
                  {advance && <th>o recargo %</th>}
                  {advance && <th>Anticipo / saldo club</th>}
                  {textil && <th>Precio de lista</th>}
                  {textil && <th>Cupo</th>}
                  {textil && <th>Orden</th>}
                  {textil && <th>Activo</th>}
                </tr>
              </thead>
              <tbody>
                {c.products.map((cp) => (
                  <tr key={cp.id}>
                    <td><span className="font-mono text-xs text-muted">{cp.product.code}</span><div className="font-semibold">{cp.product.name}</div></td>
                    {advance && (
                      <td>
                        {textil ? (
                          <input name={`textil_${cp.id}`} className="input w-32" inputMode="decimal" defaultValue={pesosInput(cp.textilPrice)} aria-label="Precio textil" disabled={!editable} />
                        ) : cp.textilPrice != null ? <Money cents={cp.textilPrice} /> : <span className="text-warn">Pendiente de la textil</span>}
                      </td>
                    )}
                    <td><input name={`price_${cp.id}`} className="input w-32" inputMode="decimal" defaultValue={pesosInput(cp.price)} aria-label="Precio al socio" disabled={advance && !editable} /></td>
                    {advance && <td><input name={`markup_${cp.id}`} className="input w-24" inputMode="decimal" defaultValue={cp.markupBp != null ? String(cp.markupBp / 100).replace(".", ",") : ""} placeholder="—" aria-label="Recargo %" disabled={!editable} /></td>}
                    {advance && <td className="num text-sm">{cp.textilPrice != null ? (() => { const r = advanceUnit({ textil: cp.textilPrice, price: cp.price, extrasTextil: 0, taxBp: c.clubTaxBp }); return <><Money cents={r.advance} /> / <Money cents={r.club} /></>; })() : "—"}</td>}
                    {textil && <td><input name={`list_${cp.id}`} className="input w-32" inputMode="decimal" defaultValue={pesosInput(cp.listPrice)} aria-label="Precio de lista" /></td>}
                    {textil && <td><input name={`max_${cp.id}`} type="number" min={1} className="input w-24" defaultValue={cp.maxUnits ?? ""} placeholder="Sin límite" aria-label="Cupo" /></td>}
                    {textil && <td><input name={`sort_${cp.id}`} type="number" className="input w-20" defaultValue={cp.sort} aria-label="Orden" /></td>}
                    {textil && <td><input name={`active_${cp.id}`} type="checkbox" className="h-5 w-5" defaultChecked={cp.active} aria-label="Activo" /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {available.length > 0 && (editable || !advance) && (
            <div className="card grid gap-3 p-4 sm:grid-cols-[2fr_1fr] sm:items-end">
              <div className="field">
                <label htmlFor="addProduct">Agregar producto del catálogo</label>
                <select id="addProduct" name="addProduct" className="input" defaultValue="">
                  <option value="">Ninguno</option>
                  {available.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="addPrice">{advance ? "Precio al socio" : "Precio de preventa"}</label><input id="addPrice" name="addPrice" className="input" inputMode="decimal" placeholder="Precio de lista si queda vacío" /></div>
            </div>
          )}
          <p className="text-sm text-muted">
            {advance
              ? `El precio textil lo fija la textil. El club fija el precio al socio (directo o con recargo %), nunca menor al textil. El anticipo que paga el comprador por Mercado Pago es el precio textil más ${c.clubTaxBp / 100} % de la diferencia (cobertura impositiva: la venta total la factura el fabricante); el resto es el saldo que cobra el club. El comprador ve solo anticipo y saldo. Si completás el recargo, se usa en lugar del precio directo. Los pedidos hechos conservan su precio.`
              : "El precio de lista solo se muestra tachado si es mayor que el de preventa. El cupo por producto es opcional; sin cupo no se muestra disponibilidad."}
          </p>
          <SubmitButton className="btn btn-primary justify-self-start">Guardar colección</SubmitButton>
        </ActionForm>
      </Section>

      {advance && (
        <Section title="Alcance de la campaña">
          <ActionForm action={audienceAction.bind(null, id)} className="card grid gap-4 p-5">
            <div className="field">
              <label htmlFor="audience">¿Para quién es la preventa?</label>
              <select id="audience" name="audience" className="input" defaultValue={c.audience} disabled={!editable}>
                {Object.entries(AUDIENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <fieldset className="grid gap-1">
              <legend className="label">Disciplinas (si el alcance es por disciplina)</legend>
              <div className="flex flex-wrap gap-3">
                {c.club.sports.map((s) => (
                  <label key={s.sportId} className="flex items-center gap-2"><input type="checkbox" name="sportIds" value={s.sportId} defaultChecked={c.audienceSports.some((x) => x.id === s.sportId)} className="h-5 w-5" disabled={!editable} /> {s.sport.name}</label>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-1">
              <legend className="label">Categorías (si el alcance es por categoría)</legend>
              <div className="flex flex-wrap gap-3">
                {c.club.categories.map((x) => (
                  <label key={x.id} className="flex items-center gap-2"><input type="checkbox" name="categoryIds" value={x.id} defaultChecked={c.audienceCategories.some((y) => y.id === x.id)} className="h-5 w-5" disabled={!editable} /> {x.sport ? `${x.sport.name} · ` : ""}{x.name}</label>
                ))}
              </div>
            </fieldset>
            {editable && <SubmitButton className="btn btn-primary justify-self-start">Guardar alcance</SubmitButton>}
          </ActionForm>
        </Section>
      )}

      {advance && (
        <Section title="Reglas de producción por producto">
          <p className="mb-3 text-sm text-muted">
            Las define y aprueba la textil. Categoría completa: la cantidad esperada se fija por campaña (no es universal). Outfit: mínimo de producción {OUTFIT_INITIAL_PURCHASE_DEFAULT} unidades (editable); el club se compromete a comprar la diferencia entre lo vendido y el mínimo, y si se llega se le sugiere un respaldo de {OUTFIT_BACKUP_SUGGESTION}. Ninguna regla se aprueba sola.
          </p>
          <div className="grid gap-3">
            {c.products.map((cp) => {
              const r = ruleOf.get(cp.id);
              return (
                <div key={cp.id} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>{cp.product.name} <span className="font-mono text-xs text-muted">{cp.product.code} · {cp.product.family}</span></b>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone="muted">{RULE_LABEL[cp.ruleType]}</Badge>
                      {cp.ruleType !== "NONE" && <Badge tone={cp.ruleApprovedAt ? "ok" : "warn"}>{cp.ruleApprovedAt ? "Aprobada para abrir" : "Sin aprobar"}</Badge>}
                      {cp.ruleType === "FULL_CATEGORY" && r && <Badge tone={r.canProduce ? "ok" : "warn"}>{r.confirmed} de {cp.expectedQty ?? "?"} confirmados{cp.productionApprovedAt ? " · producción aprobada" : ""}</Badge>}
                      {cp.ruleType === "INITIAL_PURCHASE" && !cp.initialPurchaseWaived && <Badge tone={cp.clubCommitAt ? "ok" : "warn"}>{cp.clubCommitAt ? "Club comprometido" : "Sin compromiso del club"}</Badge>}
                      {cp.ruleType === "INITIAL_PURCHASE" && r && !cp.initialPurchaseWaived && <Badge tone={r.canProduce ? "ok" : "warn"}>{r.confirmed} de {cp.initialPurchaseMin}{cp.initialPurchaseEstimated ? " (estimado)" : ""} vendidas</Badge>}
                    </span>
                  </div>
                  {r && r.openProblems.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-warn">{r.openProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
                  {cp.ruleNote && <p className="mt-1 text-sm text-muted">Nota: {cp.ruleNote}</p>}
                  {cp.ruleType === "INITIAL_PURCHASE" && r && !r.waived && !editable && (
                    <div className="mt-2 rounded-lg bg-surface-2 p-3 text-sm">
                      {r.shortfall > 0
                        ? <p>El club compra la diferencia: <b>{r.shortfall}</b> unidades para llegar a {r.initialPurchaseMin}.</p>
                        : <p>La preventa llegó al mínimo. Respaldo sugerido al club: <b>{r.backup}</b> unidades (cambios de talle o venta posterior).</p>}
                      {r.suggestion.length > 0 && <p className="mt-1">Talles sugeridos según lo vendido: {r.suggestion.map((x) => `${x.size}: ${x.qty}`).join(" · ")}</p>}
                      {r.purchase ? <p className="mt-1">Compra registrada: {r.purchase.committedQty} u. · {r.purchase.approvedAt ? "aprobada" : "sin aprobar"} · <Link className="underline" href={`/admin/clubes/${c.clubId}/muestrario`}>revisar</Link></p>
                        : textil && (r.shortfall > 0 || r.backup > 0) && (
                          <ActionForm action={shortfallPurchaseAction.bind(null, id, cp.id)} className="mt-2"><SubmitButton className="btn btn-primary btn-sm">Registrar compra sugerida del club</SubmitButton></ActionForm>
                        )}
                      {r.shortfall > 0 && !r.shortfallCovered && <p className="mt-1 text-warn">La producción de este producto queda retenida hasta aprobar esa compra (o una excepción).</p>}
                    </div>
                  )}
                  {cp.ruleType === "INITIAL_PURCHASE" && !cp.initialPurchaseWaived && !cp.clubCommitAt && editable && (
                    <ActionForm action={commitShortfallAction.bind(null, id, cp.id)} className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm">El club se compromete a comprar la diferencia hasta {cp.initialPurchaseMin ?? OUTFIT_INITIAL_PURCHASE_DEFAULT} unidades si la preventa no llega.</span>
                      <SubmitButton className="btn btn-ghost btn-sm">Registrar compromiso del club</SubmitButton>
                    </ActionForm>
                  )}
                  {textil && editable && (
                    <details className="mt-3">
                      <summary className="btn btn-ghost btn-sm">Editar regla</summary>
                      <ActionForm action={saveRuleAction.bind(null, id, cp.id)} className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="field"><label htmlFor={`rt-${cp.id}`}>Regla</label>
                          <select id={`rt-${cp.id}`} name="ruleType" className="input" defaultValue={cp.ruleType}>
                            {Object.entries(RULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        <div className="field"><label htmlFor={`rc-${cp.id}`}>Categoría (categoría completa)</label>
                          <select id={`rc-${cp.id}`} name="ruleCategoryId" className="input" defaultValue={cp.ruleCategoryId ?? ""}>
                            <option value="">—</option>
                            {c.club.categories.map((x) => <option key={x.id} value={x.id}>{x.sport ? `${x.sport.name} · ` : ""}{x.name}</option>)}
                          </select>
                        </div>
                        <div className="field"><label htmlFor={`eq-${cp.id}`}>Cantidad esperada</label><input id={`eq-${cp.id}`} name="expectedQty" type="number" min={1} className="input" defaultValue={cp.expectedQty ?? ""} /></div>
                        <div className="field"><label htmlFor={`im-${cp.id}`}>Mínimo de producción</label><input id={`im-${cp.id}`} name="initialPurchaseMin" type="number" min={1} className="input" defaultValue={cp.initialPurchaseMin ?? ""} placeholder={String(OUTFIT_INITIAL_PURCHASE_DEFAULT)} /></div>
                        <div className="field"><label htmlFor={`cp-${cp.id}`}>Compra del club (diferencia o respaldo)</label>
                          <select id={`cp-${cp.id}`} name="clubPurchaseId" className="input" defaultValue={cp.clubPurchaseId ?? ""}>
                            <option value="">Sin vincular</option>
                            {purchases.map((p) => <option key={p.id} value={p.id}>{p.purposes.map((x) => PURPOSE_LABEL[x]).join(" + ")} · {p.committedQty} u. {p.approvedAt ? "(aprobada)" : ""}</option>)}
                          </select>
                        </div>
                        <div className="grid gap-1 self-end">
                          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="initialPurchaseEstimated" defaultChecked={cp.initialPurchaseEstimated} className="h-5 w-5" /> Mínimo estimado (a confirmar)</label>
                          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="initialPurchaseWaived" defaultChecked={cp.initialPurchaseWaived} className="h-5 w-5" /> Excepción: sin mínimo (con aprobación)</label>
                        </div>
                        <div className="field md:col-span-3"><label htmlFor={`rn-${cp.id}`}>Nota</label><input id={`rn-${cp.id}`} name="ruleNote" className="input" defaultValue={cp.ruleNote ?? ""} /></div>
                        <SubmitButton className="btn btn-primary justify-self-start">Guardar regla</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                  {textil && cp.ruleType !== "NONE" && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {!cp.ruleApprovedAt && editable && (
                        <ActionForm action={approveRuleAction.bind(null, id, cp.id, "open")} className="flex flex-wrap items-end gap-2">
                          <input name="note" className="input w-64" placeholder={cp.initialPurchaseWaived ? "Motivo de la excepción (obligatorio)" : "Nota (opcional)"} aria-label="Nota" />
                          <SubmitButton className="btn btn-primary btn-sm">Aprobar para abrir</SubmitButton>
                        </ActionForm>
                      )}
                      {cp.ruleApprovedAt && !cp.productionApprovedAt && r && !r.canProduce && !editable && (
                        <ActionForm action={approveRuleAction.bind(null, id, cp.id, "production")} className="flex flex-wrap items-end gap-2">
                          <input name="note" className="input w-64" placeholder="Motivo de producir con menos (obligatorio)" aria-label="Motivo" />
                          <SubmitButton className="btn btn-ghost btn-sm">Aprobar producción excepcional</SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {textil && (<>
      <Section title="Configuración">
        <ActionForm action={updateCampaign.bind(null, id)} className="grid gap-6">
          <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
            <legend className="px-1 font-display text-lg font-bold uppercase">General</legend>
            <div className="field"><label htmlFor="title">Título</label><input id="title" name="title" className="input" defaultValue={c.title} /></div>
            <div className="field"><label htmlFor="slug">URL</label><input id="slug" name="slug" className="input" defaultValue={c.slug} /><small>/club/{c.club.slug}/{c.slug}</small></div>
            <div className="field"><label htmlFor="season">Temporada</label><input id="season" name="season" className="input" defaultValue={c.season ?? ""} /></div>
            <label className="flex items-center gap-2 self-end font-semibold"><input type="checkbox" name="showCatalogWhenClosed" defaultChecked={c.showCatalogWhenClosed} className="h-5 w-5" /> Mostrar el catálogo al cerrar</label>
            <T name="description" label="Descripción" value={c.description} rows={3} />
          </fieldset>

          <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
            <legend className="px-1 font-display text-lg font-bold uppercase">Ventana y entrega</legend>
            <div className="field"><label htmlFor="opensAt">Apertura (hora Argentina)</label><input id="opensAt" name="opensAt" type="datetime-local" className="input" defaultValue={toArLocal(c.opensAt)} /></div>
            <div className="field"><label htmlFor="closesAt">Cierre (hora Argentina)</label><input id="closesAt" name="closesAt" type="datetime-local" className="input" defaultValue={toArLocal(c.closesAt)} /></div>
            <div className="field"><label htmlFor="deliveryDaysMin">Entrega: desde (días del cierre)</label><input id="deliveryDaysMin" name="deliveryDaysMin" type="number" className="input" defaultValue={c.deliveryDaysMin} /></div>
            <div className="field"><label htmlFor="deliveryDaysMax">Entrega: hasta (días del cierre)</label><input id="deliveryDaysMax" name="deliveryDaysMax" type="number" className="input" defaultValue={c.deliveryDaysMax} /></div>
            {advance ? (
              <p className="text-sm text-muted md:col-span-2">Entrega consolidada al club: sin envío a domicilio. El envío textil → club se registra en Logística.</p>
            ) : (
              <>
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="pickupEnabled" defaultChecked={c.pickupEnabled} className="h-5 w-5" /> Retiro en sede</label>
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="shippingEnabled" defaultChecked={c.shippingEnabled} className="h-5 w-5" /> Envío a domicilio</label>
                <div className="field"><label htmlFor="shippingPrice">Costo de envío (ARS)</label><input id="shippingPrice" name="shippingPrice" className="input" inputMode="decimal" defaultValue={pesosInput(c.shippingPrice)} /></div>
                <div className="field"><label htmlFor="shippingNotes">Detalle del envío</label><input id="shippingNotes" name="shippingNotes" className="input" defaultValue={c.shippingNotes ?? ""} /></div>
              </>
            )}
            <T name="pickupInstructions" label="Instrucciones de retiro" value={c.pickupInstructions} hint={`La dirección y los horarios se toman del club: ${c.club.pickupAddress ?? "sin cargar"}.`} />
          </fieldset>

          <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
            <legend className="px-1 font-display text-lg font-bold uppercase">Cobro</legend>
            {advance && (
              <div className="field md:col-span-2">
                <label htmlFor="clubTaxPercent">Cobertura impositiva sobre la diferencia del club (%)</label>
                <input id="clubTaxPercent" name="clubTaxPercent" className="input" inputMode="decimal" defaultValue={String(c.clubTaxBp / 100).replace(".", ",")} />
                <small>Se suma al anticipo (21 % + 3 % = 24 % por defecto). Rige para pedidos nuevos; no se muestra desglosada al comprador.</small>
              </div>
            )}
            <div className="field md:col-span-2">
              <label htmlFor="paymentAccountId">Destinatario único de los cobros</label>
              <select id="paymentAccountId" name="paymentAccountId" className="input" defaultValue={c.paymentAccountId}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.owner === "TEXTIL" ? "Textil" : "Club"} · {a.label}</option>)}
              </select>
              <small>{accountNotes.join(" · ")}</small>
            </div>
            <div className="field">
              <label htmlFor="paymentMode">Modalidad</label>
              <select id="paymentMode" name="paymentMode" className="input" defaultValue={c.paymentMode}>
                <option value="DEPOSIT">Seña y saldo (el comprador puede pagar el total)</option>
                <option value="FULL">Pago total obligatorio</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="depositType">Tipo de seña</label>
              <select id="depositType" name="depositType" className="input" defaultValue={c.depositType}>
                <option value="PERCENT">Porcentaje de prendas y personalización</option>
                <option value="FIXED">Importe fijo por pedido</option>
              </select>
            </div>
            <div className="field"><label htmlFor="depositPercent">Seña (%)</label><input id="depositPercent" name="depositPercent" type="number" min={1} max={99} className="input" defaultValue={c.depositType === "PERCENT" ? c.depositValue : 50} /></div>
            <div className="field"><label htmlFor="depositFixed">Seña fija (ARS)</label><input id="depositFixed" name="depositFixed" className="input" inputMode="decimal" defaultValue={c.depositType === "FIXED" ? pesosInput(c.depositValue) : ""} /></div>
            <div className="field md:col-span-2"><label htmlFor="balanceDueText">Vencimiento del saldo</label><input id="balanceDueText" name="balanceDueText" className="input" defaultValue={c.balanceDueText ?? ""} placeholder="Antes del retiro, al recibir el aviso" /></div>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="allowMercadoPago" defaultChecked={c.allowMercadoPago} className="h-5 w-5" /> Mercado Pago</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="allowTransfer" defaultChecked={c.allowTransfer} className="h-5 w-5" /> Transferencia con comprobante</label>
            <div className="field"><label htmlFor="mpReservationMinutes">Reserva de cupo con Mercado Pago (min)</label><input id="mpReservationMinutes" name="mpReservationMinutes" type="number" className="input" defaultValue={c.mpReservationMinutes} /></div>
            <div className="field"><label htmlFor="transferHoldHours">Reserva para transferir (horas)</label><input id="transferHoldHours" name="transferHoldHours" type="number" className="input" defaultValue={c.transferHoldHours} /></div>
          </fieldset>

          <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
            <legend className="px-1 font-display text-lg font-bold uppercase">Producción</legend>
            <div className="field"><label htmlFor="minUnits">Mínimo de producción (prendas)</label><input id="minUnits" name="minUnits" type="number" min={1} className="input" defaultValue={c.minUnits ?? ""} placeholder="Sin mínimo" /></div>
            <div className="field"><label htmlFor="maxUnits">Cupo máximo total (prendas)</label><input id="maxUnits" name="maxUnits" type="number" min={1} className="input" defaultValue={c.maxUnits ?? ""} placeholder="Sin cupo" /></div>
            <div className="field md:col-span-2">
              <label htmlFor="lotCondition">Pedidos que entran al lote de fabricación</label>
              <select id="lotCondition" name="lotCondition" className="input" defaultValue={c.lotCondition}>
                <option value="DEPOSIT_APPROVED">Con seña aprobada</option>
                <option value="FULLY_PAID">Solo pagados por completo</option>
              </select>
            </div>
            <T name="minPolicyText" label="Qué pasa si no se alcanza el mínimo (texto público)" value={c.minPolicyText} hint="No prometas devoluciones automáticas: la decisión se registra en el panel y las devoluciones se gestionan por pedido." />
          </fieldset>

          <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
            <legend className="px-1 font-display text-lg font-bold uppercase">Formulario y políticas</legend>
            <div className="field">
              <label htmlFor="memberNumberMode">Número de socio</label>
              <select id="memberNumberMode" name="memberNumberMode" className="input" defaultValue={c.memberNumberMode}>
                <option value="HIDDEN">No pedir</option>
                <option value="OPTIONAL">Opcional (declarativo)</option>
                <option value="REQUIRED">Obligatorio (declarativo)</option>
              </select>
              <small>Es un dato declarado por el comprador; no se presenta como verificado.</small>
            </div>
            <div />
            <T name="policyChanges" label="Política de cambios" value={c.policyChanges} />
            <T name="policyCancellation" label="Política de cancelación" value={c.policyCancellation} />
            <T name="policyRefunds" label="Política de devoluciones" value={c.policyRefunds} />
            <T name="faq" label="Preguntas frecuentes" value={faq} rows={6} hint="Una por línea, con el formato: Pregunta | Respuesta" />
          </fieldset>
          <SubmitButton className="btn btn-primary justify-self-start">Guardar configuración</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Beneficio del club">
        <ActionForm action={saveBenefit.bind(null, id)} className="card grid gap-4 p-5 md:grid-cols-2">
          <div className="field md:col-span-2">
            <label htmlFor="benefitType">Regla</label>
            <select id="benefitType" name="benefitType" className="input" defaultValue={c.benefitRule?.type ?? ""}>
              <option value="">Sin beneficio</option>
              {Object.entries(BENEFIT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="benefitFixed">Importe por prenda (ARS)</label><input id="benefitFixed" name="benefitFixed" className="input" inputMode="decimal" defaultValue={c.benefitRule?.type === "FIXED_PER_UNIT" ? pesosInput(c.benefitRule.value) : ""} /></div>
          <div className="field"><label htmlFor="benefitPercent">Porcentaje</label><input id="benefitPercent" name="benefitPercent" className="input" inputMode="decimal" defaultValue={c.benefitRule?.type === "PERCENT_OF_GARMENTS" ? String(c.benefitRule.value / 100).replace(".", ",") : ""} /></div>
          <div className="field md:col-span-2"><label htmlFor="benefitNotes">Notas internas</label><input id="benefitNotes" name="benefitNotes" className="input" defaultValue={c.benefitRule?.notes ?? ""} /></div>
          <p className="text-sm text-muted md:col-span-2">Es un registro comercial interno: no reparte pagos ni transfiere dinero. Se fija en cada pedido al confirmarse y no se muestra al comprador.</p>
          <SubmitButton className="btn btn-primary justify-self-start">Guardar beneficio</SubmitButton>
        </ActionForm>
      </Section>
      </>)}
    </>
  );
}
