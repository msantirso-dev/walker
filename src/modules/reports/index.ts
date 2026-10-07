import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/shared/db";
import { fmtShortTime } from "@/shared/dates";
import { paymentStateLabel, ORDER_STATUS_LABEL, DELIVERY_STATUS_LABEL } from "@/modules/orders/queries";
import type { LotReport } from "@/modules/production";

type Cell = string | number | null | undefined;
type Sheet = { name: string; header: string[]; rows: Cell[][]; money?: number[] };

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
  wb.creator = "Camada";
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
      header: ["Ref. unidad", "Código producto", "Código prenda", "Talle", "Nombre estampado", "Número", "Movimiento"],
      rows: r.personalization.map((p) => [p.unitRef, p.productCode, p.garmentCode, p.size, p.name ?? "", p.number ?? "", p.delta > 0 ? "Alta" : "Baja"]),
    },
  ];
}

/** Reporte comercial de una campaña (datos de contacto, cobros y entrega). */
export async function commercialSheets(campaignId: string): Promise<Sheet[]> {
  const orders = await db.order.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    include: { players: true, units: { where: { status: "ACTIVE" }, include: { components: true, player: true } }, payments: true },
  });
  const pedidos: Sheet = {
    name: "Pedidos",
    header: ["Pedido", "Fecha", "Estado", "Pago", "Comprador", "Correo", "Celular", "N.º socio (declarado)", "Jugadores", "Prendas", "Total", "Cobrado", "En revisión", "Saldo", "Devuelto", "Entrega", "Estado de entrega", "Dirección"],
    money: [10, 11, 12, 13, 14],
    rows: orders.map((o) => [
      o.code, fmtShortTime(o.createdAt), ORDER_STATUS_LABEL[o.status], paymentStateLabel(o), o.buyerName, o.buyerEmail, o.buyerPhone, o.memberNumber ?? "",
      o.players.map((p) => `${p.name} (${[p.sport, p.category, p.team].filter(Boolean).join(" ")})`).join(" | "),
      o.units.length, o.total / 100, o.paidAmount / 100, o.inReviewAmount / 100, Math.max(0, o.total - o.paidAmount) / 100, o.refundedAmount / 100,
      o.deliveryMethod === "PICKUP" ? "Retiro" : "Envío", DELIVERY_STATUS_LABEL[o.deliveryStatus], o.shippingAddress ?? "",
    ]),
  };
  const prendas: Sheet = {
    name: "Prendas",
    header: ["Pedido", "Ref. unidad", "Jugador", "Deporte", "Categoría", "Equipo", "Producto", "Talles", "Nombre", "Número", "Precio", "Personalización"],
    money: [10, 11],
    rows: orders.flatMap((o) =>
      o.units.map((u) => [
        o.code, u.ref, u.player?.name ?? "Sin jugador", u.player?.sport ?? "", u.player?.category ?? "", u.player?.team ?? "", `${u.productCode} ${u.productName}`,
        u.components.map((c) => `${c.label} ${c.sizeLabel}`).join(" + "), u.persName ?? "", u.persNumber ?? "", u.unitPrice / 100, u.persPrice / 100,
      ]),
    ),
  };
  const pagos: Sheet = {
    name: "Pagos",
    header: ["Pedido", "Fecha", "Tipo", "Medio", "Estado", "Importe", "Referencia", "Simulado"],
    money: [5],
    rows: orders.flatMap((o) =>
      o.payments.map((p) => [o.code, fmtShortTime(p.createdAt), p.kind, p.method, p.status, p.amount / 100, p.operationRef ?? p.providerPaymentId ?? "", p.simulated ? "Sí" : "No"]),
    ),
  };
  return [pedidos, prendas, pagos];
}
