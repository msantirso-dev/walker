import Link from "next/link";
import { requireUser, can, clubScope } from "@/modules/auth";
import { LOT_STATUS_LABEL } from "@/modules/production";
import { db } from "@/shared/db";
import { fmtDate } from "@/shared/dates";
import { notFound } from "next/navigation";
import { Badge, Empty, PageHeader } from "@/shared/ui";

export const dynamic = "force-dynamic";

export default async function Production() {
  const u = await requireUser();
  if (!can(u, "production.view") && !can(u, "lot.receive")) notFound();
  const lots = await db.productionLot.findMany({
    where: { campaign: clubScope(u), ...(u.role === "CLUB_ADMIN" ? { status: { not: "PENDING_APPROVAL" } } : {}) },
    orderBy: [{ createdAt: "desc" }],
    include: { campaign: { include: { club: { select: { name: true } } } }, _count: { select: { units: true } } },
  });
  return (
    <>
      <PageHeader eyebrow="Fabricación" title="Producción">Lotes consolidados por campaña. Las órdenes de fabricación no incluyen datos personales.</PageHeader>
      {lots.length === 0 ? <Empty>Todavía no hay lotes. Se generan desde cada campaña al cerrar la ventana.</Empty> : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Lote</th><th>Club y campaña</th><th>Tipo</th><th>Movimientos</th><th>Estado</th><th>Creado</th></tr></thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id}>
                  <td><Link className="font-semibold underline" href={`/admin/produccion/${l.id}`}>Lote {l.number}</Link></td>
                  <td>{l.campaign.club.name}<div className="text-sm text-muted">{l.campaign.title}</div></td>
                  <td>{l.kind === "MAIN" ? "Principal" : "Ajuste"}</td>
                  <td className="num">{l._count.units}</td>
                  <td><Badge tone={l.status === "PENDING_APPROVAL" ? "warn" : l.status === "RECEIVED_BY_CLUB" ? "ok" : "info"}>{LOT_STATUS_LABEL[l.status]}</Badge></td>
                  <td>{fmtDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
