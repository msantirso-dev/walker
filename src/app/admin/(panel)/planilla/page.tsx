import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { canEditSheet, canViewSheet, sheetRows, SHEET_STATUS_LABEL } from "@/modules/clubsheet";
import { db } from "@/shared/db";
import { fmtShort } from "@/shared/dates";
import { Badge, Empty, Money, PageHeader, Stat } from "@/shared/ui";
import { SheetForm } from "./sheet-form";

export const dynamic = "force-dynamic";

export default async function ClubSheet({ searchParams }: { searchParams: Promise<{ club?: string; campana?: string; q?: string }> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const clubId = u.role === "TEXTIL_ADMIN" ? sp.club : u.clubId;
  if (!clubId) notFound();
  const club = await db.club.findUnique({ where: { id: clubId } });
  if (!club || !canViewSheet(u, club)) notFound();
  const edit = canEditSheet(u, club);
  const campaigns = await db.campaign.findMany({ where: { clubId, pricingModel: "TEXTIL_ADVANCE", status: { notIn: ["DRAFT", "ACTIVATION_REQUESTED", "ACTIVATION_APPROVED"] } }, orderBy: { opensAt: "desc" }, select: { id: true, title: true } });
  const q = sp.q?.trim().toLowerCase();
  const rows = (await sheetRows(clubId, sp.campana)).filter((r) => !q || r.code.toLowerCase().includes(q) || r.pickupCode.toLowerCase() === q || r.buyer.toLowerCase().includes(q) || r.units.some((x) => x.player?.toLowerCase().includes(q)));
  const delivered = rows.filter((r) => r.sheet?.status === "DELIVERED").length;
  const collected = rows.reduce((a, r) => a + (r.sheet?.balancePaid ?? 0), 0);
  const expected = rows.reduce((a, r) => a + r.clubBalance, 0);

  return (
    <>
      <PageHeader
        eyebrow={club.name}
        title="Planilla de gestión del club"
        actions={<a className="btn btn-ghost" href={`/api/admin/planilla?club=${clubId}${sp.campana ? `&campana=${sp.campana}` : ""}`}>Descargar (CSV)</a>}
      >
        {edit
          ? "Tu copia de lo que se compró y quién. Acá anotás cobros del saldo, retiros y cancelaciones. Es tu registro: no modifica los pedidos ni los datos de la textil."
          : "Registro propio del club (solo lectura para la textil). No afecta los pedidos ni los estados del sistema."}
      </PageHeader>
      {!club.managementPanel && <p className="notice notice-warn mb-4">La planilla está desactivada para este club (servicio adicional).</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos" value={rows.length} />
        <Stat label="Entregados (planilla)" value={`${delivered} / ${rows.length}`} />
        <Stat label="Saldo del club según compras" value={<Money cents={expected} />} hint="Precio al socio − anticipo" />
        <Stat label="Cobrado (planilla)" value={<Money cents={collected} />} />
      </div>

      <form className="card mt-6 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {u.role === "TEXTIL_ADMIN" && <input type="hidden" name="club" value={clubId} />}
        <div className="field"><label htmlFor="campana">Campaña</label>
          <select id="campana" name="campana" className="input" defaultValue={sp.campana ?? ""}><option value="">Todas</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        </div>
        <div className="field"><label htmlFor="q">Buscar</label><input id="q" name="q" className="input" defaultValue={sp.q ?? ""} placeholder="Pedido, código de retiro, comprador o jugador" /></div>
        <button className="btn btn-ghost">Filtrar</button>
      </form>

      {rows.length === 0 ? <Empty>Sin pedidos confirmados.</Empty> : (
        <div className="mt-6 grid gap-3">
          {rows.map((r) => (
            <details key={r.id} className="card p-4" open={rows.length === 1}>
              <summary className="cursor-pointer">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <b className="font-mono">{r.code}</b> <b>{r.buyer}</b> <span className="text-sm text-muted">{r.phone}</span>
                  <Badge tone="info">{r.stage}</Badge>
                  <Badge tone={r.sheet?.status === "DELIVERED" ? "ok" : r.sheet?.status === "CANCELLED" ? "danger" : "warn"}>{SHEET_STATUS_LABEL[r.sheet?.status ?? "PENDING"]}</Badge>
                  <span className="text-sm">Saldo: <Money cents={r.clubBalance} /></span>
                </span>
              </summary>
              <ul className="mt-3 text-sm">
                {r.units.map((x) => <li key={x.ref}><span className="font-mono text-xs">{x.ref}</span> {x.product} · {x.player ?? "sin jugador"}{x.category ? ` (${x.category})` : ""} · {x.sizes}{x.pers ? ` · ${x.pers}` : ""}</li>)}
              </ul>
              <p className="mt-1 text-xs text-muted">{r.campaign} · código de retiro {r.pickupCode}{r.sheet?.deliveredAt ? ` · retiró ${r.sheet.deliveredTo} el ${fmtShort(r.sheet.deliveredAt)}` : ""}</p>
              {edit ? <div className="mt-3"><SheetForm orderId={r.id} sheet={r.sheet} balance={r.clubBalance} /></div> : r.sheet?.notes && <p className="mt-2 text-sm">Nota del club: {r.sheet.notes}</p>}
              <Link href={`/admin/pedidos/${r.id}`} className="mt-2 inline-block text-sm underline">Ver pedido</Link>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
