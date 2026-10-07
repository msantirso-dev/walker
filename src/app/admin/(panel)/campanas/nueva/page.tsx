import { requireUser, assertCan } from "@/modules/auth";
import { db } from "@/shared/db";
import { toArLocal, addDays } from "@/shared/dates";
import { PageHeader } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { createCampaign } from "../actions";

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  const u = await requireUser();
  assertCan(u, "campaign.manage");
  const { club } = await searchParams;
  const [clubs, accounts] = await Promise.all([
    db.club.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.paymentAccount.findMany({ orderBy: { label: "asc" }, include: { club: { select: { name: true } } } }),
  ]);
  const now = new Date();
  return (
    <>
      <PageHeader eyebrow="Campañas" title="Nueva campaña">Se crea como borrador. Después configurás colección, precios, seña y políticas, y la publicás.</PageHeader>
      <ActionForm action={createCampaign} className="card grid gap-4 p-5 md:grid-cols-2">
        <div className="field">
          <label htmlFor="clubId">Club</label>
          <select id="clubId" name="clubId" className="input" defaultValue={club ?? ""} required>
            <option value="" disabled>Elegir club</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="title">Título</label><input id="title" name="title" className="input" placeholder="Colección oficial 2027" required /></div>
        <div className="field"><label htmlFor="season">Temporada</label><input id="season" name="season" className="input" placeholder="2027" /></div>
        <div className="field"><label htmlFor="slug">URL</label><input id="slug" name="slug" className="input" placeholder="coleccion-2027" /><small>Se completa sola si la dejás vacía.</small></div>
        <div className="field"><label htmlFor="opensAt">Apertura (hora Argentina)</label><input id="opensAt" name="opensAt" type="datetime-local" className="input" defaultValue={toArLocal(now)} required /></div>
        <div className="field"><label htmlFor="closesAt">Cierre (hora Argentina)</label><input id="closesAt" name="closesAt" type="datetime-local" className="input" defaultValue={toArLocal(addDays(now, 21))} required /></div>
        <div className="field md:col-span-2">
          <label htmlFor="paymentAccountId">Destinatario de los cobros</label>
          <select id="paymentAccountId" name="paymentAccountId" className="input" required>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.owner === "TEXTIL" ? "Textil" : `Club ${a.club?.name ?? ""}`} · {a.label}</option>)}
          </select>
          <small>Un único destinatario por campaña. Las cuentas de club solo valen para ese club.</small>
        </div>
        <SubmitButton className="btn btn-primary justify-self-start">Crear borrador</SubmitButton>
      </ActionForm>
    </>
  );
}
