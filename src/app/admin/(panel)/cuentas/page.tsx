import { requireUser, assertCan } from "@/modules/auth";
import { onlineMode } from "@/modules/payments";
import { db } from "@/shared/db";
import { env } from "@/shared/env";
import { Badge, PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { createAccount, updateAccount } from "./actions";

export const dynamic = "force-dynamic";

function BankFields({ a }: { a?: { label: string; bankHolder: string | null; bankName: string | null; bankCbu: string | null; bankAlias: string | null; bankCuit: string | null; id?: string } }) {
  const k = a?.id ?? "new";
  return (
    <>
      <div className="field"><label htmlFor={`label-${k}`}>Nombre de la cuenta</label><input id={`label-${k}`} name="label" className="input" defaultValue={a?.label} /></div>
      <div className="field"><label htmlFor={`holder-${k}`}>Titular</label><input id={`holder-${k}`} name="bankHolder" className="input" defaultValue={a?.bankHolder ?? ""} /></div>
      <div className="field"><label htmlFor={`bank-${k}`}>Banco</label><input id={`bank-${k}`} name="bankName" className="input" defaultValue={a?.bankName ?? ""} /></div>
      <div className="field"><label htmlFor={`cuit-${k}`}>CUIT</label><input id={`cuit-${k}`} name="bankCuit" className="input" defaultValue={a?.bankCuit ?? ""} /></div>
      <div className="field"><label htmlFor={`cbu-${k}`}>CBU o CVU</label><input id={`cbu-${k}`} name="bankCbu" className="input font-mono" inputMode="numeric" defaultValue={a?.bankCbu ?? ""} /></div>
      <div className="field"><label htmlFor={`alias-${k}`}>Alias</label><input id={`alias-${k}`} name="bankAlias" className="input font-mono uppercase" defaultValue={a?.bankAlias ?? ""} /></div>
    </>
  );
}

export default async function Accounts() {
  const u = await requireUser();
  assertCan(u, "clubs.manage");
  const [accounts, clubs] = await Promise.all([
    db.paymentAccount.findMany({ orderBy: [{ owner: "desc" }, { label: "asc" }], include: { club: { select: { name: true } }, _count: { select: { campaigns: true } } } }),
    db.club.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const envMp = Boolean(env().MP_ACCESS_TOKEN && env().MP_WEBHOOK_SECRET);
  return (
    <>
      <PageHeader eyebrow="Cobros" title="Cuentas de cobro">
        Cada campaña cobra a una sola cuenta: la de la empresa o la del club. Las credenciales de Mercado Pago se guardan cifradas y nunca se muestran.
      </PageHeader>
      <div className="grid gap-4">
        {accounts.map((a) => {
          const mode = onlineMode(a);
          return (
            <details key={a.id} className="card p-5">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span><b className="font-display text-xl uppercase">{a.label}</b> <span className="text-sm text-muted">· {a.owner === "TEXTIL" ? "Textil" : `Club ${a.club?.name}`} · {a._count.campaigns} campaña(s)</span></span>
                <span className="flex gap-2">
                  <Badge tone={a.bankCbu ? "ok" : "warn"}>{a.bankCbu ? "Transferencia lista" : "Sin datos bancarios"}</Badge>
                  <Badge tone={mode === "mercadopago" ? "ok" : mode === "simulator" ? "warn" : "muted"}>
                    {mode === "mercadopago" ? `Mercado Pago ${a.mpPublicLabel ?? "(variables de entorno)"}` : mode === "simulator" ? "Mercado Pago simulado" : "Mercado Pago pendiente de credenciales"}
                  </Badge>
                </span>
              </summary>
              <ActionForm action={updateAccount.bind(null, a.id)} className="mt-4 grid gap-4 md:grid-cols-2">
                <BankFields a={a} />
                <fieldset className="grid gap-3 rounded-lg border border-line p-4 md:col-span-2">
                  <legend className="px-1 font-semibold">Mercado Pago (Checkout Pro)</legend>
                  <p className="text-sm text-muted">
                    Copiá el Access Token y la clave secreta de webhooks desde Tus integraciones. Configurá en Mercado Pago la URL de notificaciones:
                    <span className="block select-all break-all font-mono">{env().APP_URL}/api/webhooks/mercadopago/{a.id}</span>
                    {a.owner === "TEXTIL" && envMp && !a.mpAccessTokenEnc && " Esta cuenta usa las credenciales MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET del servidor."}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="field"><label htmlFor={`tok-${a.id}`}>Access Token</label><input id={`tok-${a.id}`} name="mpAccessToken" type="password" className="input font-mono" autoComplete="off" placeholder={a.mpPublicLabel ? `Guardado: ${a.mpPublicLabel}` : "APP_USR-…"} /></div>
                    <div className="field"><label htmlFor={`sec-${a.id}`}>Clave secreta del webhook</label><input id={`sec-${a.id}`} name="mpWebhookSecret" type="password" className="input font-mono" autoComplete="off" placeholder={a.mpWebhookSecretEnc ? "Guardada" : ""} /></div>
                  </div>
                  {a.mpAccessTokenEnc && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mpClear" /> Eliminar credenciales guardadas</label>}
                </fieldset>
                <SubmitButton className="btn btn-primary justify-self-start">Guardar cuenta</SubmitButton>
              </ActionForm>
            </details>
          );
        })}
      </div>
      <Section title="Nueva cuenta">
        <ActionForm action={createAccount} className="card grid gap-4 p-5 md:grid-cols-2" resetOnOk>
          <div className="field md:col-span-2">
            <label htmlFor="clubId">Titularidad</label>
            <select id="clubId" name="clubId" className="input">
              <option value="">Textil</option>
              {clubs.map((c) => <option key={c.id} value={c.id}>Club: {c.name}</option>)}
            </select>
          </div>
          <BankFields />
          <SubmitButton className="btn btn-primary justify-self-start">Crear cuenta</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
