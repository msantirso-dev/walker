import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan } from "@/modules/auth";
import { getBrand } from "@/modules/brand";
import { AGREEMENT_STATUS_LABEL, DEFAULT_EXCLUSIVITY_MONTHS, defaultBrandLine } from "@/modules/agreements";
import { db } from "@/shared/db";
import { fmtDate, toArLocal, addDays } from "@/shared/dates";
import { Badge, PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { saveAgreementAction } from "./actions";

export const dynamic = "force-dynamic";
const DAY = 86400_000;

type A = Awaited<ReturnType<typeof db.clubAgreement.findMany>>[number];

function AgreementForm({ clubId, a, brand }: { clubId: string; a: A | null; brand: string }) {
  const start = a?.startsAt ?? new Date();
  const end = a?.endsAt ?? addDays(start, Math.round(DEFAULT_EXCLUSIVITY_MONTHS * 30.44));
  const T = ({ name, label, value, hint }: { name: string; label: string; value?: string | null; hint?: string }) => (
    <div className="field md:col-span-2"><label htmlFor={`${name}-${a?.id ?? "new"}`}>{label}</label><textarea id={`${name}-${a?.id ?? "new"}`} name={name} className="input" rows={2} defaultValue={value ?? ""} />{hint && <small>{hint}</small>}</div>
  );
  return (
    <ActionForm action={saveAgreementAction.bind(null, clubId, a?.id ?? null)} className="card grid gap-4 p-5 md:grid-cols-2">
      <div className="field"><label htmlFor={`st-${a?.id ?? "new"}`}>Estado</label>
        <select id={`st-${a?.id ?? "new"}`} name="status" className="input" defaultValue={a?.status ?? "DRAFT"}>
          {Object.entries(AGREEMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 self-end font-semibold"><input type="checkbox" name="exclusive" defaultChecked={a?.exclusive ?? true} className="h-5 w-5" /> Exclusividad</label>
      <div className="field"><label htmlFor={`sa-${a?.id ?? "new"}`}>Inicio</label><input id={`sa-${a?.id ?? "new"}`} name="startsAt" type="date" className="input" defaultValue={toArLocal(start).slice(0, 10)} /></div>
      <div className="field"><label htmlFor={`ea-${a?.id ?? "new"}`}>Fin</label><input id={`ea-${a?.id ?? "new"}`} name="endsAt" type="date" className="input" defaultValue={toArLocal(end).slice(0, 10)} /><small>Sugerido: {DEFAULT_EXCLUSIVITY_MONTHS} meses (editable).</small></div>
      <div className="field"><label htmlFor={`bl-${a?.id ?? "new"}`}>Línea de marca (pública)</label><input id={`bl-${a?.id ?? "new"}`} name="brandLine" className="input" defaultValue={a?.brandLine ?? ""} placeholder={brand} /><small>Es lo único del acuerdo que se muestra en la tienda.</small></div>
      <div className="field"><label htmlFor={`ad-${a?.id ?? "new"}`}>Avisar vencimiento (días antes)</label><input id={`ad-${a?.id ?? "new"}`} name="alertDaysBefore" type="number" min={1} max={365} className="input" defaultValue={a?.alertDaysBefore ?? 60} /></div>
      <T name="samplesCommitted" label="Muestras comprometidas" value={a?.samplesCommitted} />
      <T name="catalogAgreed" label="Catálogo acordado" value={a?.catalogAgreed} />
      <T name="activationConditions" label="Condiciones de activación" value={a?.activationConditions} />
      <T name="initialPurchases" label="Compras iniciales" value={a?.initialPurchases} />
      <T name="pricingRules" label="Reglas de precio" value={a?.pricingRules} hint="Las reglas nuevas aplican a campañas nuevas; no recalculan pedidos existentes." />
      <T name="notes" label="Notas internas" value={a?.notes} />
      <div className="field md:col-span-2">
        <label htmlFor={`ct-${a?.id ?? "new"}`}>Contrato firmado (PDF o imagen, privado)</label>
        <input id={`ct-${a?.id ?? "new"}`} name="contract" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-sm" />
        {a?.contractFileKey && <small>Adjunto actual: <a className="underline" href={`/api/admin/acuerdos/${a.id}/contrato`} target="_blank" rel="noopener noreferrer">{a.contractFileName ?? "contrato"}</a>. Subir otro lo reemplaza.</small>}
        <small>No hay firma electrónica: se adjunta el contrato firmado por fuera.</small>
      </div>
      <SubmitButton className="btn btn-primary justify-self-start">{a ? "Guardar acuerdo" : "Crear acuerdo"}</SubmitButton>
    </ActionForm>
  );
}

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  assertCan(u, "agreements.manage");
  const club = await db.club.findUnique({ where: { id } });
  if (!club) notFound();
  const list = await db.clubAgreement.findMany({ where: { clubId: id }, orderBy: { startsAt: "desc" } });
  const brand = defaultBrandLine(club.shortName ?? club.name, (await getBrand()).name);
  return (
    <>
      <PageHeader eyebrow={club.name} title="Acuerdo comercial" actions={<Link href={`/admin/clubes/${id}`} className="btn btn-ghost">Volver al club</Link>}>
        Información privada entre la empresa y el club. Nunca se publica en la tienda ni se muestra a compradores.
      </PageHeader>
      {list.map((a) => {
        const days = Math.ceil((a.endsAt.getTime() - Date.now()) / DAY);
        return (
          <Section key={a.id} title={`${AGREEMENT_STATUS_LABEL[a.status]} · ${fmtDate(a.startsAt)} → ${fmtDate(a.endsAt)}`}>
            <p className="mb-3 flex flex-wrap gap-2">
              {a.exclusive && <Badge tone="info">Exclusivo</Badge>}
              {a.status === "ACTIVE" && <Badge tone={days <= a.alertDaysBefore ? "warn" : "ok"}>{days > 0 ? `Vence en ${days} días` : "Vencido"}</Badge>}
            </p>
            <AgreementForm clubId={id} a={a} brand={brand} />
          </Section>
        );
      })}
      <Section title={list.length ? "Nuevo acuerdo (renovación)" : "Nuevo acuerdo"}>
        <AgreementForm clubId={id} a={null} brand={brand} />
      </Section>
    </>
  );
}
