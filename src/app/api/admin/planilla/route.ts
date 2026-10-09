import { db } from "@/shared/db";
import { currentUser } from "@/modules/auth";
import { canViewSheet, sheetRows, SHEET_STATUS_LABEL } from "@/modules/clubsheet";
import { toCsv } from "@/modules/reports";
import { fmtShort } from "@/shared/dates";

export const dynamic = "force-dynamic";

/** Planilla del club en CSV (datos personales: solo el club con el servicio o la empresa). */
export async function GET(req: Request) {
  const u = await currentUser();
  const url = new URL(req.url);
  const clubId = u?.role === "TEXTIL_ADMIN" ? url.searchParams.get("club") : u?.clubId;
  const club = clubId ? await db.club.findUnique({ where: { id: clubId } }) : null;
  if (!u || !club || !canViewSheet(u, club)) return new Response("No encontrado", { status: 404 });
  const rows = await sheetRows(club.id, url.searchParams.get("campana") ?? undefined);
  const csv = toCsv({
    name: "Planilla",
    header: ["Pedido", "Código de retiro", "Campaña", "Comprador", "Celular", "Prendas", "Etapa en el sistema", "Saldo del club", "Estado (club)", "Cobrado", "Fecha de cobro", "Medio", "Referencia", "Retiró", "Fecha de retiro", "Notas"],
    rows: rows.map((r) => [
      r.code, r.pickupCode, r.campaign, r.buyer, r.phone, r.units.map((x) => `${x.product} ${x.sizes}${x.player ? ` (${x.player})` : ""}${x.pers ? ` [${x.pers}]` : ""}`).join(" | "), r.stage,
      r.clubBalance / 100, SHEET_STATUS_LABEL[r.sheet?.status ?? "PENDING"], (r.sheet?.balancePaid ?? 0) / 100, r.sheet?.paidAt ? fmtShort(r.sheet.paidAt) : "",
      r.sheet?.method ?? "", r.sheet?.reference ?? "", r.sheet?.deliveredTo ?? "", r.sheet?.deliveredAt ? fmtShort(r.sheet.deliveredAt) : "", r.sheet?.notes ?? "",
    ]),
  });
  return new Response(new Uint8Array(csv), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="planilla-${club.slug}.csv"`, "Cache-Control": "no-store" } });
}
