import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan } from "@/modules/auth";
import { db } from "@/shared/db";
import { toArLocal } from "@/shared/dates";
import { pesosInput } from "@/shared/money";
import { PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { onlineMode } from "@/modules/payments";
import { BENEFIT_TYPE_LABEL } from "@/modules/benefits";
import { updateCampaign, saveCollection, saveBenefit } from "../../actions";

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
  assertCan(u, "campaign.manage");
  const c = await db.campaign.findUnique({
    where: { id },
    include: { club: true, benefitRule: true, products: { orderBy: { sort: "asc" }, include: { product: true } } },
  });
  if (!c) notFound();
  const [accounts, catalog] = await Promise.all([
    db.paymentAccount.findMany({ where: { OR: [{ owner: "TEXTIL" }, { clubId: c.clubId }] }, orderBy: { label: "asc" } }),
    db.product.findMany({ where: { clubId: c.clubId, active: true }, orderBy: { code: "asc" } }),
  ]);
  const faq = ((c.faq as { q: string; a: string }[] | null) ?? []).map((f) => `${f.q} | ${f.a}`).join("\n");
  const available = catalog.filter((p) => !c.products.some((x) => x.productId === p.id));
  const accountNotes = accounts.map((a) => `${a.label}: ${onlineMode(a) === "mercadopago" ? "Mercado Pago con credenciales" : onlineMode(a) === "simulator" ? "Mercado Pago simulado (faltan credenciales)" : "Mercado Pago sin credenciales"}`);

  return (
    <>
      <PageHeader eyebrow={c.club.name} title={`Configurar · ${c.title}`} actions={<Link href={`/admin/campanas/${id}`} className="btn btn-ghost">Volver a la campaña</Link>} />

      <Section title="Colección y precios">
        <ActionForm action={saveCollection.bind(null, id)} className="grid gap-4">
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Producto</th><th>Precio preventa</th><th>Precio de lista</th><th>Cupo</th><th>Orden</th><th>Activo</th></tr></thead>
              <tbody>
                {c.products.map((cp) => (
                  <tr key={cp.id}>
                    <td><span className="font-mono text-xs text-muted">{cp.product.code}</span><div className="font-semibold">{cp.product.name}</div></td>
                    <td><input name={`price_${cp.id}`} className="input w-32" inputMode="decimal" defaultValue={pesosInput(cp.price)} aria-label="Precio de preventa" /></td>
                    <td><input name={`list_${cp.id}`} className="input w-32" inputMode="decimal" defaultValue={pesosInput(cp.listPrice)} aria-label="Precio de lista" /></td>
                    <td><input name={`max_${cp.id}`} type="number" min={1} className="input w-24" defaultValue={cp.maxUnits ?? ""} placeholder="Sin límite" aria-label="Cupo" /></td>
                    <td><input name={`sort_${cp.id}`} type="number" className="input w-20" defaultValue={cp.sort} aria-label="Orden" /></td>
                    <td><input name={`active_${cp.id}`} type="checkbox" className="h-5 w-5" defaultChecked={cp.active} aria-label="Activo" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {available.length > 0 && (
            <div className="card grid gap-3 p-4 sm:grid-cols-[2fr_1fr] sm:items-end">
              <div className="field">
                <label htmlFor="addProduct">Agregar producto del catálogo</label>
                <select id="addProduct" name="addProduct" className="input" defaultValue="">
                  <option value="">Ninguno</option>
                  {available.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="addPrice">Precio de preventa</label><input id="addPrice" name="addPrice" className="input" inputMode="decimal" placeholder="Precio de lista si queda vacío" /></div>
            </div>
          )}
          <p className="text-sm text-muted">El precio de lista solo se muestra tachado si es mayor que el de preventa. El cupo por producto es opcional; sin cupo no se muestra disponibilidad.</p>
          <SubmitButton className="btn btn-primary justify-self-start">Guardar colección</SubmitButton>
        </ActionForm>
      </Section>

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
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="pickupEnabled" defaultChecked={c.pickupEnabled} className="h-5 w-5" /> Retiro en sede</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="shippingEnabled" defaultChecked={c.shippingEnabled} className="h-5 w-5" /> Envío a domicilio</label>
            <div className="field"><label htmlFor="shippingPrice">Costo de envío (ARS)</label><input id="shippingPrice" name="shippingPrice" className="input" inputMode="decimal" defaultValue={pesosInput(c.shippingPrice)} /></div>
            <div className="field"><label htmlFor="shippingNotes">Detalle del envío</label><input id="shippingNotes" name="shippingNotes" className="input" defaultValue={c.shippingNotes ?? ""} /></div>
            <T name="pickupInstructions" label="Instrucciones de retiro" value={c.pickupInstructions} hint={`La dirección y los horarios se toman del club: ${c.club.pickupAddress ?? "sin cargar"}.`} />
          </fieldset>

          <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
            <legend className="px-1 font-display text-lg font-bold uppercase">Cobro</legend>
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
    </>
  );
}
