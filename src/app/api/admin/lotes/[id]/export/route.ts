import { db } from "@/shared/db";
import { currentUser, can } from "@/modules/auth";
import { lotReport } from "@/modules/production";
import { productionSheets, toCsv, toXlsx } from "@/modules/reports";
import { slugify } from "@/shared/slug";

export const dynamic = "force-dynamic";

/** Orden de fabricación: sin datos personales de compradores ni jugadores. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = await currentUser();
  const lot = await db.productionLot.findUnique({ where: { id }, include: { campaign: { include: { club: true } } } });
  if (!u || !lot || !(can(u, "production.view") || can(u, "lot.receive", lot.campaign.clubId))) return new Response("No encontrado", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const report = await lotReport(id);
  const sheets = productionSheets(report);
  const base = `produccion-${slugify(lot.campaign.club.name)}-${lot.campaign.slug}-lote${lot.number}`;
  if (sp.get("format") === "csv") {
    const part = sp.get("part") === "personalizacion" ? 2 : sp.get("part") === "producto" ? 1 : 0;
    const names = ["consolidado", "por-producto", "personalizacion"];
    return new Response(new Uint8Array(toCsv(sheets[part])), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-${names[part]}.csv"`, "Cache-Control": "no-store" } });
  }
  const buf = await toXlsx(sheets, { title: `Lote ${lot.number}` });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
}
