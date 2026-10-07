import Link from "next/link";
import { requireUser, assertCan, clubScope, can } from "@/modules/auth";
import { CAMPAIGN_STATUS_LABEL, effectiveStatus } from "@/modules/campaigns";
import { db } from "@/shared/db";
import { fmtDate } from "@/shared/dates";
import { Badge, Empty, PageHeader } from "@/shared/ui";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  const u = await requireUser();
  assertCan(u, "campaign.view");
  const list = await db.campaign.findMany({
    where: clubScope(u),
    include: { club: { select: { name: true } }, _count: { select: { orders: { where: { status: "CONFIRMED" } } } } },
    orderBy: [{ closesAt: "desc" }],
  });
  return (
    <>
      <PageHeader eyebrow="Preventas" title="Campañas" actions={can(u, "campaign.manage") && <Link href="/admin/campanas/nueva" className="btn btn-primary">Nueva campaña</Link>} />
      {list.length === 0 ? <Empty>No hay campañas.</Empty> : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Campaña</th><th>Club</th><th>Ventana</th><th>Pedidos conf.</th><th>Estado</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const st = effectiveStatus(c);
                return (
                  <tr key={c.id}>
                    <td><Link href={`/admin/campanas/${c.id}`} className="font-semibold underline">{c.title}</Link></td>
                    <td>{c.club.name}</td>
                    <td className="text-sm">{fmtDate(c.opensAt)} → {fmtDate(c.closesAt)}</td>
                    <td className="num">{c._count.orders}</td>
                    <td><Badge tone={st === "PUBLISHED" ? "ok" : st === "CANCELLED" ? "danger" : st === "DRAFT" ? "muted" : "info"}>{st === "SCHEDULED" ? "Programada" : CAMPAIGN_STATUS_LABEL[st]}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
