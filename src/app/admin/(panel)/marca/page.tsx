import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { DEBT_BLOCK_LABEL, getBrand } from "@/modules/brand";
import { db } from "@/shared/db";
import { fmtDateTime } from "@/shared/dates";
import { advanceUnit, DEFAULT_CLUB_TAX_BP } from "@/shared/advance";
import { ars } from "@/shared/money";
import { PageHeader } from "@/shared/ui";
import { ActionForm, ImageInput, SubmitButton } from "@/shared/ui/client";
import { formulaAction, saveBrandAction } from "./actions";

export const metadata = { title: "Marca" };

export default async function BrandPage() {
  const u = await requireUser();
  if (u.role !== "TEXTIL_ADMIN") notFound();
  const b = await getBrand();
  const approver = b.formulaApprovedById ? await db.user.findUnique({ where: { id: b.formulaApprovedById }, select: { name: true } }) : null;
  const ex = advanceUnit({ textil: 1_000_000, price: 1_300_000, extrasTextil: 0, taxBp: DEFAULT_CLUB_TAX_BP });
  return (
    <>
      <PageHeader eyebrow="Empresa" title="Marca y fórmula">
        Nombre, logo, colores y contacto de la web comercial, las tiendas y el panel.
      </PageHeader>

      <section className="card mb-6 p-5">
        <h2 className="text-2xl font-bold">Fórmula del anticipo</h2>
        <p className="mt-1 text-sm text-muted">
          Anticipo A = B + D, con D = (P − B) × deducciones de la campaña. Ejemplo con 24,5 %: B {ars(1_000_000)}, P {ars(1_300_000)} → D {ars(ex.tax)}, A {ars(ex.advance)}, saldo al club {ars(ex.club)}.
        </p>
        {b.formulaApproved ? (
          <p className="notice notice-ok mt-3">
            Aprobada el {fmtDateTime(b.formulaApprovedAt!)}{approver ? ` por ${approver.name}` : ""}. {b.formulaNote}
          </p>
        ) : (
          <p className="notice notice-warn mt-3">
            <b>Pendiente de aprobación.</b> Mientras tanto, las campañas no crean cobros reales en Mercado Pago; las tiendas de demostración y el simulador siguen funcionando.
          </p>
        )}
        <ActionForm action={formulaAction} className="mt-4 grid gap-3">
          <div className="field">
            <label htmlFor="f-note">Qué se aprobó</label>
            <textarea id="f-note" name="note" className="input" rows={3} defaultValue={b.formulaNote ?? ""} placeholder="Bases de cada porcentaje, si están incluidos en el precio final, a quién corresponde D y cómo se documenta." />
          </div>
          <div className="flex flex-wrap gap-2">
            <button name="decision" value="approve" className="btn btn-primary">
              Registrar aprobación
            </button>
            {b.formulaApproved && (
              <button name="decision" value="revoke" className="btn btn-ghost">
                Retirar aprobación
              </button>
            )}
          </div>
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="text-2xl font-bold">Identidad</h2>
        <ActionForm action={saveBrandAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="field">
            <label htmlFor="b-name">Nombre de la marca</label>
            <input id="b-name" name="name" className="input" defaultValue={b.name} required />
          </div>
          <div className="field">
            <label htmlFor="b-tag">Frase corta</label>
            <input id="b-tag" name="tagline" className="input" defaultValue={b.tagline ?? ""} />
          </div>
          <ImageInput name="logo" current={b.logoUrl} label="Logo (opcional: sin logo se usa el nombre)" />
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" name="removeLogo" /> Quitar el logo actual
          </label>
          <div className="field">
            <label htmlFor="b-c1">Color principal</label>
            <input id="b-c1" name="colorPrimary" type="color" className="input h-12 p-1" defaultValue={b.colorPrimary} />
          </div>
          <div className="field">
            <label htmlFor="b-c2">Color de acento</label>
            <input id="b-c2" name="colorAccent" type="color" className="input h-12 p-1" defaultValue={b.colorAccent} />
          </div>
          <div className="field">
            <label htmlFor="b-mail">Correo de contacto</label>
            <input id="b-mail" name="contactEmail" type="email" className="input" defaultValue={b.contactEmail ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="b-wa">WhatsApp</label>
            <input id="b-wa" name="whatsapp" className="input" defaultValue={b.whatsapp ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="b-ig">Instagram</label>
            <input id="b-ig" name="instagram" className="input" defaultValue={b.instagram ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="b-debt">Bloqueo por deuda del club (por defecto)</label>
            <select id="b-debt" name="debtBlockDefault" className="input" defaultValue={b.debtBlockDefault}>
              {Object.entries(DEBT_BLOCK_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <small>Decisión comercial: qué no se despacha mientras el club tenga compras adicionales impagas.</small>
          </div>
          <div className="field md:col-span-2">
            <label htmlFor="b-about">Texto de “Nosotros”</label>
            <textarea id="b-about" name="aboutText" className="input" rows={5} defaultValue={b.aboutText ?? ""} />
            <small>Separá los párrafos con una línea en blanco.</small>
          </div>
          <div className="md:col-span-2">
            <SubmitButton>Guardar marca</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
