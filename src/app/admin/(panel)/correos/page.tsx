import { requireUser, assertCan } from "@/modules/auth";
import { TEMPLATE_LABELS, type Template } from "@/modules/notifications";
import { db } from "@/shared/db";
import { emailConfigured } from "@/shared/env";
import { fmtShortTime } from "@/shared/dates";
import { Badge, Empty, PageHeader } from "@/shared/ui";

export const dynamic = "force-dynamic";
const L: Record<string, string> = { SENT: "Enviado", FAILED: "Falló", NOT_SENT_NO_PROVIDER: "No enviado: falta proveedor", QUEUED: "En cola" };

export default async function Emails() {
  const u = await requireUser();
  assertCan(u, "clubs.manage");
  const list = await db.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const counts = await db.emailOutbox.groupBy({ by: ["status"], _count: { _all: true } });
  return (
    <>
      <PageHeader eyebrow="Notificaciones" title="Correos">
        {emailConfigured() ? "Proveedor SMTP configurado." : "No hay proveedor de correo configurado: los avisos se registran pero no se envían. Configurá SMTP_URL y MAIL_FROM."}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">{counts.map((c) => <Badge key={c.status} tone={c.status === "SENT" ? "ok" : c.status === "QUEUED" ? "muted" : "warn"}>{L[c.status]}: {c._count._all}</Badge>)}</div>
      {list.length === 0 ? <Empty>Sin correos.</Empty> : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Para</th><th>Aviso</th><th>Asunto</th><th>Estado</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="text-sm">{fmtShortTime(e.createdAt)}</td>
                  <td className="text-sm">{e.to}</td>
                  <td>{TEMPLATE_LABELS[e.template as Template] ?? e.template}</td>
                  <td className="text-sm">{e.subject}</td>
                  <td><Badge tone={e.status === "SENT" ? "ok" : e.status === "FAILED" ? "danger" : "warn"}>{L[e.status]}</Badge>{e.error && <div className="text-xs text-danger">{e.error}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
