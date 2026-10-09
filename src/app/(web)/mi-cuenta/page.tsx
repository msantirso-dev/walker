import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember, memberOrders } from "@/modules/members";
import { decryptSecret } from "@/shared/crypto";
import { fmtDate } from "@/shared/dates";
import { ars } from "@/shared/money";
import { memberLogoutAction } from "../socios/actions";

export const metadata = { title: "Mis pedidos" };

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Pago pendiente de confirmación", tone: "badge-warn" },
  CONFIRMED: { label: "Pago aprobado · pedido en curso", tone: "badge-ok" },
  EXPIRED: { label: "Reserva vencida", tone: "badge-muted" },
  CANCELLED: { label: "Cancelado", tone: "badge-danger" },
};

/** El socio consulta únicamente sus pedidos. */
export default async function MyAccount() {
  const m = await currentMember();
  if (!m) redirect("/socios/ingresar?next=/mi-cuenta");
  const orders = await memberOrders(m.id);
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-5xl font-extrabold md:text-6xl">Mis pedidos</h1>
          <p className="mt-1 text-muted">{m.name} · {m.email}</p>
        </div>
        <form action={memberLogoutAction}>
          <button className="btn btn-ghost btn-sm">Salir</button>
        </form>
      </div>
      {orders.length === 0 ? (
        <p className="card mt-8 p-6 text-muted">
          Todavía no hiciste pedidos. Entrá a la tienda de tu club desde <Link className="underline" href="/tu-club">Tu club</Link>.
        </p>
      ) : (
        <ul className="mt-8 grid gap-3">
          {orders.map((o) => {
            const st = STATUS[o.status] ?? { label: o.status, tone: "badge-muted" };
            const adv = o.pricingModel === "TEXTIL_ADVANCE";
            return (
              <li key={o.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-muted">{o.club.name}</div>
                    <div className="font-display text-2xl font-bold uppercase">{o.campaign.title}</div>
                    <div className="text-sm text-muted">Pedido {o.code} · {fmtDate(o.createdAt)} · {o._count.units} prenda(s)</div>
                  </div>
                  <span className={`badge ${st.tone}`}>{st.label}</span>
                </div>
                <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-muted">Total</dt><dd className="font-bold">{ars(o.total)}</dd></div>
                  {adv && <div><dt className="text-muted">Anticipo</dt><dd className="font-bold">{ars(o.advanceRequired)}</dd></div>}
                  {adv && <div><dt className="text-muted">Saldo al club</dt><dd className="font-bold">{ars(o.clubBalanceRequired)}</dd></div>}
                </dl>
                <Link href={`/pedido/${decryptSecret(o.accessTokenEnc)}`} className="btn btn-ghost btn-sm mt-3">Ver pedido y seguimiento</Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
