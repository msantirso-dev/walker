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
  wb.creator = "BACK";
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
    header: ["Pedido", "Ref. unidad", "Jugador", "Deporte", "Categoría", "Equipo", "Producto", "Talles", "Nombre", "Número", "Precio", "Personalización", "Leyenda", "Opciones", "Precio de la empresa", "Adicionales textil", "Adicionales club", "Sin cambio de talle"],
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

const LOT_STAGE: Record<string, string> = {
  PENDING_APPROVAL: "A la espera del cierre", APPROVED: "Lote aprobado", IN_PRODUCTION: "En producción", QUALITY_CONTROL: "Control de calidad",
  READY_TO_SHIP: "Listo para despacho", RECEIVED_BY_CLUB: "En el club",
};
const LOT_ORDER = ["PENDING_APPROVAL", "APPROVED", "IN_PRODUCTION", "QUALITY_CONTROL", "READY_TO_SHIP", "RECEIVED_BY_CLUB"];
const SHEET_LABEL: Record<string, string> = { PENDING: "Pendiente de retiro", BALANCE_PAID: "Saldo cobrado", DELIVERED: "Entregado", CANCELLED: "Cancelado", OTHER: "Otro" };
/** Origen de las unidades que compra el club (nunca se atribuyen a socios). */
const purchaseOrigin = (purposes: string[]) =>
  purposes.includes("ADDITIONAL") ? "Compra adicional del club" : purposes.includes("INITIAL") ? "Compra del club (diferencia del mínimo)" : purposes.includes("BACKUP") ? "Compra del club (respaldo)" : "Compra del club (muestrario)";
const REASON_LABEL: Record<string, string> = { LATE_SALES: "Ventas fuera de término", BOUTIQUE: "Boutique", SIZE_CHANGES: "Cambios de talle", OTHER: "Otro" };

/**
 * Excel de pedidos y producción de una campaña (empresa y club autorizado). Cinco hojas:
 * pedidos detallados (una fila por combinación homogénea), resumen por artículo y talle, personalizaciones por unidad,
 * resumen económico y compras adicionales del club. Las unidades con personalización distinta van en filas separadas,
 * y los importes por fila suman exactamente los del pedido (no se duplican).
 */
export async function campaignWorkbook(campaignId: string): Promise<Sheet[]> {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { club: { select: { name: true } } } });
  const orders = await db.order.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    include: {
      clubSheet: { select: { status: true } },
      payments: true,
      units: {
        where: { status: "ACTIVE" },
        orderBy: { ref: "asc" },
        include: { components: true, player: true, options: { orderBy: { sort: "asc" } }, lotUnits: { where: { delta: { gt: 0 } }, include: { lot: { select: { status: true } } } } },
      },
    },
  });
  const purchases = await db.clubPurchase.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
    include: { items: { include: { product: { select: { code: true, name: true } } } }, payments: true },
  });
  const users = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const head = [c.club.name, c.title];

  // 1. Pedidos detallados
  type Row = { key: string; cells: Cell[]; qty: number; adv: number; club: number };
  const detail: Row[] = [];
  for (const o of orders) {
    const groups = new Map<string, Row>();
    for (const u of o.units) {
      const sizes = u.components.map((x) => (u.components.length > 1 ? `${x.label} ${x.sizeLabel}` : x.sizeLabel)).join(" + ");
      const variant = [...new Set(u.components.map((x) => x.variant).filter(Boolean))].join(" / ");
      const extras = u.options.filter((x) => !["Nombre", "Número"].some((n) => x.groupName.startsWith(n)) && x.value !== u.legend).map((x) => `${x.groupName}: ${x.value}`).join(" · ");
      const stage = u.lotUnits.length ? LOT_STAGE[u.lotUnits.map((l) => l.lot.status).sort((a, b) => LOT_ORDER.indexOf(a) - LOT_ORDER.indexOf(b))[0]] : o.status === "CONFIRMED" ? "A la espera del cierre" : "—";
      const key = [u.productId, sizes, variant, u.persName, u.persNumber, u.legend, extras, u.playerId, stage].join("|");
      const unitFinal = u.unitPrice + u.persPrice;
      const unitAdv = o.pricingModel === "TEXTIL_ADVANCE" ? u.advanceAmount : 0;
      const g = groups.get(key) ?? {
        key, qty: 0, adv: 0, club: 0,
        cells: [
          ...head, o.code, fmtShortTime(o.createdAt), "Socio", `${u.productCode} ${u.productName}`, variant, 0, sizes, u.persNumber ?? "", u.persName ?? "",
          u.player?.sport ?? "", u.player?.category ?? "", u.player?.name ?? "", o.buyerName, o.buyerEmail, o.buyerPhone, 0,
          o.status === "CONFIRMED" ? "Aprobado" : o.status === "PENDING_PAYMENT" ? "Pendiente de confirmación" : ORDER_STATUS_LABEL[o.status], 0, stage,
          o.pricingModel === "TEXTIL_ADVANCE" ? (o.clubSheet ? SHEET_LABEL[o.clubSheet.status] : stage === "En el club" ? "En el club, listo para retirar" : "—") : DELIVERY_STATUS_LABEL[o.deliveryStatus],
          extras, u.legend ?? "",
        ],
      };
      g.qty++;
      g.adv += unitAdv;
      g.club += o.pricingModel === "TEXTIL_ADVANCE" ? unitFinal - unitAdv : 0;
      groups.set(key, g);
    }
    detail.push(...groups.values());
  }
  for (const p of purchases)
    for (const it of p.items)
      detail.push({
        key: it.id, qty: it.quantity, adv: 0, club: 0,
        cells: [...head, `Compra ${p.id.slice(-6).toUpperCase()}`, fmtShortTime(p.createdAt), purchaseOrigin(p.purposes), it.product ? `${it.product.code} ${it.product.name}` : "Varios", "", it.quantity, it.sizeLabel, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      });
  const pedidos: Sheet = {
    name: "Pedidos detallados",
    header: ["Club", "Campaña", "Pedido", "Fecha", "Origen", "Artículo", "Variante", "Cantidad", "Talle", "Número estampado", "Nombre personalizado", "Disciplina", "Categoría", "Jugador", "Comprador", "Correo", "Teléfono", "Anticipo", "Estado del anticipo", "Saldo al club", "Estado de producción", "Estado de entrega", "Otros adicionales", "Leyenda"],
    money: [17, 19],
    rows: detail.map((r) => {
      const x = [...r.cells];
      x[7] = r.qty;
      if (x[4] === "Socio") {
        x[17] = r.adv / 100;
        x[19] = r.club / 100;
      }
      return x;
    }),
  };

  // 2. Resumen por artículo y talle (socios y compras del club por separado)
  const sum = new Map<string, { art: string; garment: string; size: string; member: number; club: number }>();
  for (const o of orders.filter((o) => o.status === "CONFIRMED"))
    for (const u of o.units)
      for (const x of u.components) {
        const k = `${u.productCode}|${x.garmentCode}|${x.sizeLabel}`;
        const r = sum.get(k) ?? { art: `${u.productCode} ${u.productName}`, garment: `${x.garmentCode} ${x.garmentName}${x.variant ? ` (${x.variant})` : ""}`, size: x.sizeLabel, member: 0, club: 0 };
        r.member++;
        sum.set(k, r);
      }
  for (const p of purchases)
    for (const it of p.items) {
      const k = `${it.product?.code ?? "—"}|club|${it.sizeLabel}`;
      const r = sum.get(k) ?? { art: it.product ? `${it.product.code} ${it.product.name}` : "Varios", garment: "Compra del club", size: it.sizeLabel, member: 0, club: 0 };
      r.club += it.quantity;
      sum.set(k, r);
    }
  const resumen: Sheet = {
    name: "Resumen artículo y talle",
    header: ["Club", "Campaña", "Artículo", "Prenda", "Talle", "Socios (confirmados)", "Compras del club", "Total"],
    rows: [...sum.values()].sort((a, b) => a.art.localeCompare(b.art) || a.garment.localeCompare(b.garment)).map((r) => [...head, r.art, r.garment, r.size, r.member, r.club, r.member + r.club]),
  };

  // 3. Personalizaciones por unidad
  const pers: Sheet = {
    name: "Personalizaciones",
    header: ["Club", "Campaña", "Pedido", "Ref. unidad", "Artículo", "Talle", "Nombre", "Número", "Leyenda", "Otros adicionales", "Jugador", "Disciplina", "Categoría", "Sin cambio de talle"],
    rows: orders.flatMap((o) =>
      o.units
        .filter((u) => u.persName || u.persNumber || u.legend || u.options.length)
        .map((u) => [
          ...head, o.code, u.ref, `${u.productCode} ${u.productName}`, u.components.map((x) => x.sizeLabel).join(" + "), u.persName ?? "", u.persNumber ?? "", u.legend ?? "",
          u.options.map((x) => `${x.groupName}: ${x.value}`).join(" · "), u.player?.name ?? "", u.player?.sport ?? "", u.player?.category ?? "", u.noSizeChange ? "Sí" : "No",
        ]),
    ),
  };

  // 4. Resumen económico (pedidos confirmados; la comisión del proveedor es costo de la empresa)
  const conf = orders.filter((o) => o.status === "CONFIRMED" && o.pricingModel === "TEXTIL_ADVANCE");
  let P = 0, B = 0, D = 0, A = 0, S = 0;
  for (const o of conf) {
    P += o.total;
    A += o.advanceRequired;
    S += o.clubBalanceRequired;
    for (const u of o.units) {
      const b = (u.textilPrice ?? 0) + u.optionsTextil;
      B += b;
      D += u.advanceAmount - b;
    }
  }
  const mp = orders.flatMap((o) => o.payments).filter((p) => p.method === "MERCADOPAGO" && p.status === "APPROVED" && !p.simulated);
  const gross = mp.reduce((a, p) => a + (p.providerGross ?? p.amount), 0);
  const net = mp.reduce((a, p) => a + (p.providerNet ?? p.providerGross ?? p.amount), 0);
  const pendingAdv = orders.filter((o) => o.status === "PENDING_PAYMENT").reduce((a, o) => a + o.advanceRequired, 0);
  const agreed = purchases.reduce((a, p) => a + (p.agreedAmount ?? 0), 0);
  const paid = purchases.reduce((a, p) => a + p.payments.reduce((x, y) => x + y.amount, 0), 0);
  const deductions = c.clubTaxBp / 100;
  const econ: Sheet = {
    name: "Resumen económico",
    header: ["Concepto", "Importe", "Detalle"],
    money: [1],
    rows: [
      ["Precio final al socio (P)", P / 100, `${conf.length} pedido(s) confirmados`],
      ["Precio de la empresa (B)", B / 100, "Producto + adicionales"],
      ["Diferencia del club (G = P − B)", (P - B) / 100, ""],
      ["Deducciones sobre G (D)", D / 100, `Hipótesis ${String(deductions).replace(".", ",")} %, pendiente de aprobación`],
      ["Anticipo online (A = B + D)", A / 100, "Cobrado por Mercado Pago"],
      ["Saldo al club (S = P − A)", S / 100, "Lo cobra el club a sus socios"],
      ["Anticipos pendientes de confirmación", pendingAdv / 100, "Pedidos sin pago aprobado"],
      ["Bruto cobrado por el proveedor", gross / 100, `${mp.length} pago(s) reales`],
      ["Comisión del proveedor (costo de la empresa)", (gross - net) / 100, "No se traslada al club ni al socio"],
      ["Neto recibido", net / 100, ""],
      ["Compras adicionales del club: acordado", agreed / 100, ""],
      ["Compras adicionales del club: pagado", paid / 100, ""],
      ["Compras adicionales del club: pendiente", Math.max(0, agreed - paid) / 100, ""],
      ["Resultado estimado del club", (S - agreed) / 100, "Saldo de socios − compras acordadas; no incluye costos propios"],
    ],
  };

  // 5. Compras adicionales del club
  const compras: Sheet = {
    name: "Compras del club",
    header: ["Club", "Campaña", "Compra", "Fecha", "Motivos", "Artículo", "Talle", "Cantidad", "Precio acordado por unidad", "Importe acordado", "Pagado", "Pendiente", "Vencimiento", "Aprobada", "Responsable"],
    money: [8, 9, 10, 11],
    rows: purchases.flatMap((p) => {
      const paidP = p.payments.reduce((a, x) => a + x.amount, 0);
      return p.items.map((it, i) => [
        ...head, p.id.slice(-6).toUpperCase(), fmtShortTime(p.createdAt), p.reasons.map((r) => REASON_LABEL[r]).join(", ") || p.purposes.join(", "),
        it.product ? `${it.product.code} ${it.product.name}` : "Varios", it.sizeLabel, it.quantity, it.unitPrice != null ? it.unitPrice / 100 : null,
        i === 0 ? (p.agreedAmount ?? 0) / 100 : null, i === 0 ? paidP / 100 : null, i === 0 ? Math.max(0, (p.agreedAmount ?? 0) - paidP) / 100 : null,
        p.dueAt ? fmtShortTime(p.dueAt) : "", p.approvedAt ? "Sí" : "No", users.get(p.createdById) ?? "",
      ]);
    }),
  };
  return [pedidos, resumen, pers, econ, compras];
}
