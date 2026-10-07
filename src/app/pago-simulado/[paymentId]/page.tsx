import { notFound, redirect } from "next/navigation";
import { db } from "@/shared/db";
import { env, simulatorEnabled } from "@/shared/env";
import { decryptSecret } from "@/shared/crypto";
import { ars } from "@/shared/money";
import { signSimulatorEvent } from "@/modules/payments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pago simulado", robots: { index: false } };

async function simulate(paymentId: string, status: "APPROVED" | "REJECTED" | "PENDING") {
  "use server";
  if (!simulatorEnabled()) notFound();
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!p || !p.simulated) notFound();
  const sp = await db.simulatedPayment.create({ data: { id: `SIM${Date.now()}${Math.floor(Math.random() * 1000)}`, paymentId: p.id, status, amount: p.amount } });
  // Notificación firmada al webhook del simulador, igual que haría el proveedor
  const ts = String(Date.now());
  await fetch(`${env().APP_URL}/api/webhooks/simulador?type=payment&data.id=${sp.id}`, {
    method: "POST",
    headers: { "x-simulator-signature": `${ts},${signSimulatorEvent(sp.id, ts)}` },
    cache: "no-store",
  }).catch(() => null);
  redirect(`/pedido/${decryptSecret(p.order.accessTokenEnc)}?retorno=1`);
}

export default async function SimPage({ params }: { params: Promise<{ paymentId: string }> }) {
  if (!simulatorEnabled()) notFound();
  const { paymentId } = await params;
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { club: true } } } });
  if (!p || !p.simulated) notFound();
  const done = !["CREATED", "PENDING"].includes(p.status);
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="notice notice-warn mb-6 font-semibold">
        SIMULACIÓN DE PAGO. Esta pantalla reemplaza a Mercado Pago en el entorno de prueba. No se cobra ni se mueve dinero.
      </div>
      <div className="card p-6">
        <div className="eyebrow">Checkout simulado</div>
        <h1 className="mt-1 text-4xl font-extrabold">{ars(p.amount)}</h1>
        <p className="mt-2 text-muted">
          Pedido {p.order.code} · {p.order.club.name}
        </p>
        {done ? (
          <p className="notice notice-info mt-6">Este intento de pago ya fue procesado ({p.status}).</p>
        ) : (
          <div className="mt-6 grid gap-2">
            <form action={simulate.bind(null, p.id, "APPROVED")}><button className="btn btn-primary w-full">Simular pago aprobado</button></form>
            <form action={simulate.bind(null, p.id, "PENDING")}><button className="btn btn-ghost w-full">Simular pago pendiente</button></form>
            <form action={simulate.bind(null, p.id, "REJECTED")}><button className="btn btn-ghost w-full">Simular pago rechazado</button></form>
          </div>
        )}
      </div>
    </main>
  );
}
