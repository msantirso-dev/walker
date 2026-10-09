import { db } from "@/shared/db";
import { currentUser, can } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { campaignWorkbook, toCsv, toXlsx } from "@/modules/reports";
import { slugify } from "@/shared/slug";

export const dynamic = "force-dynamic";

/** Excel de pedidos y producción (5 hojas). Datos personales: solo la empresa y el club de la campaña. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = await currentUser();
  const c = await db.campaign.findUnique({ where: { id }, include: { club: true } });
  if (!u || !c || !can(u, "reports.export", c.clubId) || !can(u, "orders.view", c.clubId)) return new Response("No encontrado", { status: 404 });
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const sheets = await campaignWorkbook(id);
  await audit({ id: u.id, role: u.role, clubId: u.clubId }, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "report.commercial", data: { format } });
  const base = `pedidos-${slugify(c.club.name)}-${c.slug}`;
  if (format === "csv") {
    return new Response(new Uint8Array(toCsv(sheets[0])), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" } });
  }
  const buf = await toXlsx(sheets, { title: `Pedidos y producción ${c.title}` });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
}
