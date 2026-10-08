import { notFound, redirect } from "next/navigation";
import { requireUser, can, clubScope } from "@/modules/auth";
import { normalizePickupCode } from "@/modules/deliveries";
import { db } from "@/shared/db";

/** Destino del QR de retiro. Requiere sesión; el código no revela datos personales. */
export default async function ByCode({ params }: { params: Promise<{ code: string }> }) {
  const u = await requireUser();
  if (!can(u, "deliveries.register")) notFound();
  const code = normalizePickupCode((await params).code);
  if (!code) notFound();
  const o = await db.order.findFirst({ where: { ...clubScope(u), pickupCode: code }, select: { id: true, code: true, pricingModel: true } });
  if (!o) notFound();
  // v2: el retiro lo anota el club en su planilla
  if (o.pricingModel === "TEXTIL_ADVANCE") redirect(`/admin/planilla?q=${code}`);
  redirect(`/admin/entregas/${o.id}`);
}
