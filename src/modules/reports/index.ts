import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/shared/db";
import { fmtShortTime } from "@/shared/dates";
import { paymentStateLabel, ORDER_STATUS_LABEL, DELIVERY_STATUS_LABEL } from "@/modules/orders/queries";
import type { LotReport } from "@/modules/production";

type Cell = string | number | null | undefined;
export type Sheet = { name: string; header: string[]; rows: Cell[][]; money?: number[] };

/** Evita inyección de fórmulas al abrir el archivo en Excel. */
function safe(v: Cell): Cell {
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v;
}

export function toCsv(sheet: Sheet): Buffer {
  const esc = (v: Cell) => {
    const s = v == null ? "" : String(safe(v));
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [sheet.header, ...sheet.rows].map((r) => r.map(esc).join(";"));
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

export async function toXlsx(sheets: Sheet[], meta: { title: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Walkersport";
  wb.title = meta.title;
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow(s.header).font = { bold: true };
    for (const r of s.rows) ws.addRow(r.map(safe));
    ws.columns.forEach((col, i) => {
      col.width = Math.min(40, Math.max(10, (s.header[i]?.length ?? 8) + 4));
      if (s.money?.includes(i)) col.numFmt = '"$" #,##0.00';
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Reporte de fabricación: sin datos personales (ni comprador ni jugador). */
export function productionSheets(r: LotReport): Sheet[] {
  const head = `${r.club} · ${r.campaign} · Lote ${r.lotNumber}${r.kind === "ADJUSTMENT" ? " (ajuste)" : ""}`;
  return [
    {
      name: "Consolidado",
      header: ["Club y campaña", "Código prenda", "Prenda", "Variante", "Talle", "Cantidad"],
      rows: r.lines.map((l) => [head, l.garmentCode, l.garmentName, l.variant ?? "", l.size, l.quantity]),
    },
    {
      name: "Por producto",
      header: ["Código producto", "Producto", "Componente", "Código prenda", "Talle", "Cantidad"],
      rows: r.breakdown.map((b) => [b.productCode, b.productName, b.component, b.garmentCode, b.size, b.quantity]),
    },
    {
      name: "Personalización",
      header: ["Ref. unidad", "Código producto", "Código prenda", "Talle", "Nombre estampado", "Número", "Leyenda", "Otros adicionales", "Movimiento"],
      rows: r.personalization.map((p) => [p.unitRef, p.productCode, p.garmentCode, p.size, p.name ?? "", p.number ?? "", p.legend ?? "", p.extras ?? "", p.delta > 0 ? "Alta" : "Baja"]),
    },
    {
      // Trabajos de estampado/bordado sobre las prendas base: no fragmentan el lote base
      name: "Trabajos de personalización",
      header: ["Trabajo", "Valor", "Código prenda", "Cantidad"],
      rows: (r.persJobs ?? []).map((j) => [j.kind, j.value, j.garmentCode, j.quantity]),
    },
  ];
}

/** Reporte comercial de una campaña (datos de contacto, cobros y entrega). */
export async function commercialSheets(campaignId: string): Promise<Sheet[]> {
  const orders = await db.order.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    include: { players: true, units: { where: { status: "ACTIVE" }, include: { components: true, player: true, options: { orderBy: { sort: "asc" } } } }, payments: true },
  });
  const pedidos: Sheet = {
    name: "Pedidos",
    header: ["Pedido", "Fecha", "Estado", "Pago", "Comprador", "Correo", "Celular", "N.º socio (declarado)", "Jugadores", "Prendas", "Total", "Cobrado", "En revisión", "Saldo", "Devuelto", "Entrega", "Estado de entrega", "Dirección", "Modelo", "Anticipo requerido", "Anticipo cobrado (textil)", "Saldo club", "Cobertura impositiva (%)", "Política de cambios aceptada"],
    money: [10, 11, 12, 13, 14, 19, 20, 21],
    rows: orders.map((o) => [
      o.code, fmtShortTime(o.createdAt), ORDER_STATUS_LABEL[o.status], paymentStateLabel(o), o.buyerName, o.buyerEmail, o.buyerPhone, o.memberNumber ?? "",
      o.players.map((p) => `${p.name} (${[p.sport, p.category, p.team].filter(Boolean).join(" ")})`).join(" | "),
      o.units.length, o.total / 100, o.paidAmount / 100, o.inReviewAmount / 100, Math.max(0, o.total - o.paidAmount) / 100, o.refundedAmount / 100,
      o.deliveryMethod === "PICKUP" ? "Retiro" : "Envío", DELIVERY_STATUS_LABEL[o.deliveryStatus], o.shippingAddress ?? "",
      o.pricingModel === "TEXTIL_ADVANCE" ? "Anticipo textil" : "Seña", o.advanceRequired / 100, o.advancePaid / 100, o.clubBalanceRequired / 100, o.clubTaxBp != null ? o.clubTaxBp / 100 : "", o.policyVersion ?? "",
    ]),
  };
  const prendas: Sheet = {
    name: "Prendas",
    header: ["Pedido", "Ref. unidad", "Jugador", "Deporte", "Categoría", "Equipo", "Producto", "Talles", "Nombre", "Número", "Precio", "Personalización", "Leyenda", "Opciones", "Precio textil", "Adicionales textil", "Adicionales club", "Sin cambio de talle"],
    money: [10, 11, 14, 15, 16],
    rows: orders.flatMap((o) =>
      o.units.map((u) => [
        o.code, u.ref, u.player?.name ?? "Sin jugador", u.player?.sport ?? "", u.player?.category ?? "", u.player?.team ?? "", `${u.productCode} ${u.productName}`,
        u.components.map((c) => `${c.label} ${c.sizeLabel}`).join(" + "), u.persName ?? "", u.persNumber ?? "", u.unitPrice / 100, u.persPrice / 100,
        u.legend ?? "", u.options.map((x) => `${x.groupName}: ${x.value}`).join(" · "), u.textilPrice != null ? u.textilPrice / 100 : null, u.optionsTextil / 100, u.optionsClub / 100, u.noSizeChange ? "Sí" : "No",
      ]),
    ),
  };
  const pagos: Sheet = {
    name: "Pagos",
    // Conciliación: operación (bruto) vs pagado por el comprador (incluye intereses de financiación) vs neto acreditado (descuenta cargos)
    header: ["Pedido", "Fecha", "Tipo", "Medio", "Estado", "Importe", "Referencia", "Simulado", "Cobra", "Fecha de cobro", "Bruto proveedor", "Pagado por comprador", "Neto acreditado", "Cuotas"],
    money: [5, 10, 11, 12],
    rows: orders.flatMap((o) =>
      o.payments.map((p) => [
        o.code, fmtShortTime(p.createdAt), p.kind, p.method, p.status, p.amount / 100, p.operationRef ?? p.providerPaymentId ?? "", p.simulated ? "Sí" : "No",
        p.receiver, p.paidAt ? fmtShortTime(p.paidAt) : "", p.providerGross != null ? p.providerGross / 100 : null, p.providerTotalPaid != null ? p.providerTotalPaid / 100 : null,
        p.providerNet != null ? p.providerNet / 100 : null, p.installments ?? null,
      ]),
    ),
  };
  return [pedidos, prendas, pagos];
}

/** Lista de distribución del club: por comprador y jugador, saldo con el club y retiro. Contiene datos personales. */
export async function distributionSheets(campaignId: string): Promise<Sheet[]> {
  const { distributionList } = await import("@/modules/logistics");
  const list = await distributionList(campaignId);
  return [
    {
      name: "Distribución",
      header: ["Pedido", "Comprador", "Celular", "Jugador", "Categoría", "Ref.", "Producto", "Talles", "Personalización", "En el club", "Entregada", "Retiró", "Saldo al club"],
      rows: list.flatMap((o) =>
        o.units.map((u, i) => [
          o.code, o.buyer, o.phone, u.player ?? "", u.category ?? "", u.ref, u.product, u.sizes, u.pers, u.inClub ? "Sí" : "No",
          u.delivered ? (u.deliveredAt ? fmtShortTime(u.deliveredAt) : "Sí") : "No", u.deliveredTo ?? "", i === 0 ? o.clubDue / 100 : null,
        ]),
      ),
      money: [12],
    },
  ];
}
