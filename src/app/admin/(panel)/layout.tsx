import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, logout, can, ROLE_LABELS } from "@/modules/auth";
import { db } from "@/shared/db";
import { emailConfigured, simulatorEnabled } from "@/shared/env";
import { NavLinks } from "./nav";
import { BrandMark } from "@/app/_brand/mark";
import { getBrand } from "@/modules/brand";

async function doLogout() {
  "use server";
  await logout();
  redirect("/admin/ingresar");
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const club = u.clubId ? await db.club.findUnique({ where: { id: u.clubId }, select: { name: true, managementPanel: true } }) : null;
  const company = u.role === "TEXTIL_ADMIN";
  const brand = await getBrand();
  const items = [
    { href: "/admin", label: "Inicio", show: true },
    { href: "/admin/clubes", label: "Clubes y catálogo", show: company },
    { href: "/admin/campanas", label: "Campañas", show: can(u, "campaign.view") },
    { href: "/admin/pedidos", label: "Pedidos", show: can(u, "orders.view") },
    { href: "/admin/pagos", label: "Revisión de pagos", show: can(u, "payments.review") },
    { href: "/admin/produccion", label: "Producción", show: can(u, "production.view") },
    { href: "/admin/planilla", label: company ? "Planillas de clubes" : "Planilla del club", show: company || Boolean(club?.managementPanel) },
    { href: "/admin/entregas", label: "Entregas", show: can(u, "deliveries.register") },
    { href: "/admin/cuentas", label: "Cuentas de cobro", show: can(u, "clubs.manage") },
    { href: "/admin/usuarios", label: "Usuarios", show: can(u, "clubs.manage") },
    { href: "/admin/solicitudes", label: "Solicitudes de reunión", show: company },
    { href: "/admin/marca", label: "Marca y fórmula", show: company },
    { href: "/admin/correos", label: "Correos", show: can(u, "clubs.manage") },
    { href: "/admin/cuenta", label: "Mi cuenta", show: true },
  ].filter((i) => i.show);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="bg-brand text-brand-ink md:sticky md:top-0 md:h-dvh md:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-4 py-4 md:block">
          <Link href="/admin" className="inline-block" aria-label="Inicio del panel"><BrandMark size="lg" /></Link>
          <div className="text-right text-xs opacity-80 md:mt-2 md:text-left">
            <div className="font-semibold">{u.name}</div>
            <div>{ROLE_LABELS[u.role]}{club ? ` · ${club.name}` : ""}</div>
          </div>
        </div>
        <NavLinks items={items.map(({ href, label }) => ({ href, label }))} />
        <form action={doLogout} className="px-4 pb-4 md:mt-4">
          <button className="text-sm underline opacity-80 hover:opacity-100">Salir</button>
        </form>
      </aside>
      <div className="min-w-0">
        {(u.role === "TEXTIL_ADMIN") && (!emailConfigured() || simulatorEnabled()) && (
          <div className="grid gap-1 border-b border-line bg-warn-bg px-4 py-2 text-sm text-warn md:px-8">
            {!emailConfigured() && <span><b>Correo sin configurar:</b> los avisos a compradores quedan registrados como “no enviados”. Configurá SMTP_URL.</span>}
            {simulatorEnabled() && <span><b>Simulador de pagos activo:</b> los pagos con Mercado Pago de cuentas sin credenciales son simulados y no mueven dinero.</span>}
          </div>
        )}
        {!company && (
          <div role="note" className="border-b border-line bg-info-bg px-4 py-2 text-sm text-info md:px-8">
            <b>Panel de consulta del club.</b> Podés ver y exportar la información de tu club. Las novedades y los pagos externos comunicalos a la empresa: ella los registra.
          </div>
        )}
        {company && !brand.formulaApproved && (
          <div role="note" className="border-b border-line bg-warn-bg px-4 py-2 text-sm text-warn md:px-8">
            <b>Fórmula del anticipo pendiente de aprobación:</b> no se crean cobros reales en Mercado Pago. <Link className="underline" href="/admin/marca">Revisar</Link>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
