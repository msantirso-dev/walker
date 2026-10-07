import "server-only";
import { db } from "@/shared/db";
import { sha256 } from "@/shared/crypto";
import type { Prisma } from "@/generated/prisma/client";

const fullInclude = {
  club: true,
  campaign: { include: { paymentAccount: true, lots: { where: { status: { not: "PENDING_APPROVAL" } }, select: { id: true, number: true, status: true, kind: true } } } },
  players: { orderBy: { sort: "asc" } },
  units: {
    orderBy: { sort: "asc" },
    include: { components: true, player: true, delivery: true, lotUnits: { include: { lot: { select: { number: true, status: true } } } } },
  },
  payments: { orderBy: { createdAt: "asc" }, include: { receipts: { orderBy: { uploadedAt: "asc" } } } },
  deliveries: { orderBy: { deliveredAt: "asc" }, include: { units: { select: { id: true, ref: true, productName: true } } } },
} satisfies Prisma.OrderInclude;

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof fullInclude }>;

export async function orderByToken(token: string): Promise<FullOrder | null> {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  return db.order.findUnique({ where: { accessTokenHash: sha256(token) }, include: fullInclude });
}

export async function orderById(id: string): Promise<FullOrder | null> {
  return db.order.findUnique({ where: { id }, include: fullInclude });
}

export type OrderFilters = {
  q?: string;
  status?: string;
  pay?: string; // unpaid | deposit | paid | review | refund
  delivery?: string;
  category?: string;
  productId?: string;
};

export function orderWhere(base: Prisma.OrderWhereInput, f: OrderFilters): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [base];
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { code: { contains: q.toUpperCase() } },
        { buyerName: { contains: q, mode: "insensitive" } },
        { buyerEmail: { contains: q.toLowerCase() } },
        { buyerPhone: { contains: q } },
        { players: { some: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (f.status && ["PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "EXPIRED"].includes(f.status)) and.push({ status: f.status as never });
  if (f.delivery && ["NOT_READY", "READY", "PARTIAL", "DELIVERED"].includes(f.delivery)) and.push({ deliveryStatus: f.delivery as never });
  if (f.category) and.push({ players: { some: { category: f.category } } });
  if (f.productId) and.push({ units: { some: { productId: f.productId, status: "ACTIVE" } } });
  switch (f.pay) {
    case "unpaid":
      and.push({ paidAmount: 0, status: { not: "CANCELLED" } });
      break;
    case "deposit":
      and.push({ paidAmount: { gt: 0 }, status: "CONFIRMED", NOT: { paidAmount: { gte: db.order.fields.total } } });
      break;
    case "paid":
      and.push({ paidAmount: { gte: db.order.fields.total }, total: { gt: 0 } });
      break;
    case "review":
      and.push({ inReviewAmount: { gt: 0 } });
      break;
    case "refund":
      and.push({ status: "CANCELLED", paidAmount: { gt: 0 } });
      break;
  }
  return { AND: and };
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  EXPIRED: "Reserva vencida",
};

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  NOT_READY: "Aún no disponible",
  READY: "Listo para retirar",
  PARTIAL: "Entrega parcial",
  DELIVERED: "Entregado",
};

/** Estado de pago en palabras, a partir de los importes. */
export function paymentStateLabel(o: { status: string; total: number; paidAmount: number; inReviewAmount: number; depositRequired: number }) {
  if (o.status === "CANCELLED") return o.paidAmount > 0 ? "Devolución pendiente" : "Sin cobros";
  if (o.paidAmount >= o.total && o.total > 0) return "Pagado";
  if (o.paidAmount > 0) return o.paidAmount >= o.depositRequired ? "Seña aprobada" : "Pago parcial";
  if (o.inReviewAmount > 0) return "Comprobante en revisión";
  return "Sin pagos";
}
