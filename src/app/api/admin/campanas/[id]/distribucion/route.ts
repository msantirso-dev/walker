import { db } from "@/shared/db";
import { currentUser, can } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { distributionSheets, toCsv, toXlsx } from "@/modules/reports";
import { slugify } from "@/shared/slug";

export const dynamic = "force-dynamic";

/** Lista de distribución (datos personales): textil o el club de la campaña. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = await currentUser();
  const c = await db.campaign.findUnique({ where: { id }, include: { club: true } });
  if (!u || !c || !can(u, "orders.view", c.clubId)) return new Response("No encontrado", { status: 404 });
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const sheets = await distributionSheets(id);
  await audit({ id: u.id, role: u.role, clubId: u.clubId }, { entity: "Campaign", entityId: id, clubId: c.clubId, action: "report.distribution", data: { format } });
  const base = `distribucion-${slugify(c.club.name)}-${c.slug}`;
  if (format === "csv") return new Response(new Uint8Array(toCsv(sheets[0])), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" } });
  const buf = await toXlsx(sheets, { title: `Distribución ${c.title}` });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
}
