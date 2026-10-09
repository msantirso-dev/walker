import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { LEAD_STATUS_LABEL, listLeads } from "@/modules/leads";
import { fmtDateTime } from "@/shared/dates";
import { Badge, PageHeader } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { leadAction } from "./actions";

export const metadata = { title: "Solicitudes de reunión" };

export default async function LeadsPage() {
  const u = await requireUser();
  if (u.role !== "TEXTIL_ADMIN") notFound();
  const leads = await listLeads(u);
  return (
    <>
      <PageHeader eyebrow="Web comercial" title="Solicitudes de reunión">
        Clubes que pidieron una reunión desde la web.
      </PageHeader>
      {leads.length === 0 ? (
        <p className="card p-6 text-muted">Todavía no hay solicitudes.</p>
      ) : (
        <ul className="grid gap-3">
          {leads.map((l) => (
            <li key={l.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-2xl font-bold">{l.clubName}</h2>
                <Badge tone={l.status === "NEW" ? "warn" : l.status === "CONTACTED" ? "info" : "muted"}>{LEAD_STATUS_LABEL[l.status]}</Badge>
              </div>
              <p className="text-sm">
                {l.name}
                {l.role ? ` · ${l.role}` : ""}
                {l.city ? ` · ${l.city}` : ""} · {fmtDateTime(l.createdAt)}
              </p>
              <p className="text-sm">
                <a className="underline" href={`mailto:${l.email}`}>
                  {l.email}
                </a>
                {l.phone ? ` · ${l.phone}` : ""}
              </p>
              {l.message && <p className="mt-2 whitespace-pre-line text-sm text-muted">{l.message}</p>}
              <ActionForm action={leadAction} className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                <input type="hidden" name="id" value={l.id} />
                <select name="status" className="input" defaultValue={l.status} aria-label="Estado">
                  {Object.entries(LEAD_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input name="notes" className="input" defaultValue={l.notes ?? ""} placeholder="Notas internas" aria-label="Notas internas" />
                <SubmitButton className="btn btn-ghost">Guardar</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
