import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/modules/auth";
import { orderById, DELIVERY_STATUS_LABEL } from "@/modules/orders";
import { readyUnitIds } from "@/modules/deliveries";
import { db } from "@/shared/db";
import { fmtDateTime } from "@/shared/dates";
import { Badge, Money, PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { deliverAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function DeliverOrder({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const u = await requireUser();
  const o = await orderById(orderId);
  if (!o || !can(u, "deliveries.register", o.clubId)) notFound();
  const ready = await readyUnitIds(orderId);
  const balance = Math.max(0, o.total - o.paidAmount);
  const canException = can(u, "deliveries.exception", o.clubId);
  const users = await db.user.findMany({ where: { id: { in: o.deliveries.map((d) => d.deliveredById) } }, select: { id: true, name: true } });
  const pending = o.units.filter((x) => x.status === "ACTIVE" && !x.deliveryId);
  const blocked = balance > 0 && !canException;

  return (
    <>
      <PageHeader eyebrow={o.campaign.title} title={`Entrega · ${o.code}`} actions={can(u, "orders.view", o.clubId) && <Link href={`/admin/pedidos/${o.id}`} className="btn btn-ghost">Ver pedido</Link>}>
        {o.buyerName} · <Badge tone="info">{DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Badge>
      </PageHeader>

      {o.status !== "CONFIRMED" && <p className="notice notice-danger">El pedido no está confirmado: no se puede entregar.</p>}
      {balance > 0 && (
        <p className={`notice ${canException ? "notice-warn" : "notice-danger"} mb-4`}>
          Saldo pendiente: <b><Money cents={balance} /></b>. {canException ? "Para entregar igual, completá el motivo de la excepción (queda registrado)." : "La entrega está bloqueada hasta que se registre el pago del saldo. Pedile a un administrador del club."}
        </p>
      )}

      {o.status === "CONFIRMED" && pending.length > 0 && (
        <ActionForm action={deliverAction.bind(null, o.id)} className="card grid gap-4 p-5">
          <fieldset>
            <legend className="label mb-2">Prendas a entregar</legend>
            <ul className="grid gap-2">
              {pending.map((x) => {
                const ok = ready.has(x.id);
                return (
                  <li key={x.id}>
                    <label className={`flex items-start gap-3 rounded-lg border border-line p-3 ${ok ? "cursor-pointer" : "opacity-60"}`}>
                      <input type="checkbox" name="unit" value={x.id} defaultChecked={ok} disabled={!ok || blocked} className="mt-1 h-5 w-5" />
                      <span className="min-w-0">
                        <b>{x.productName}</b> · {x.components.map((c) => `${c.label} ${c.sizeLabel}`).join(" + ")}
                        {(x.persName || x.persNumber) && <> · {x.persName} #{x.persNumber}</>}
                        <span className="block text-sm text-muted">{x.player ? `${x.player.name}${x.player.category ? ` · ${x.player.category}` : ""}` : "Sin jugador"} · <span className="font-mono">{x.ref}</span>{!ok && " · todavía no llegó al club"}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="field"><label htmlFor="receivedByName">Quién retira</label><input id="receivedByName" name="receivedByName" className="input" defaultValue={o.buyerName} required /></div>
            <div className="field"><label htmlFor="receivedByNote">Relación o referencia</label><input id="receivedByNote" name="receivedByNote" className="input" placeholder="Ej.: madre del jugador" /></div>
          </div>
          {balance > 0 && canException && (
            <div className="field"><label htmlFor="exceptionReason">Motivo de la excepción por saldo pendiente</label><textarea id="exceptionReason" name="exceptionReason" className="input" rows={2} required /></div>
          )}
          <SubmitButton className="btn btn-primary justify-self-start" disabled={blocked}>Registrar entrega</SubmitButton>
        </ActionForm>
      )}

      {o.deliveries.length > 0 && (
        <Section title="Entregas registradas">
          {o.deliveries.map((d) => (
            <div key={d.id} className="card mt-2 p-4 text-sm">
              {fmtDateTime(d.deliveredAt)} · {d.units.map((x) => x.productName).join(", ")} · Retiró <b>{d.receivedByName}</b> · Registró {users.find((x) => x.id === d.deliveredById)?.name}
              {d.balanceException && <div className="text-warn">Excepción por saldo: {d.balanceException}</div>}
            </div>
          ))}
        </Section>
      )}
    </>
  );
}
