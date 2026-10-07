import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/modules/auth";
import { db } from "@/shared/db";
import { Badge, Empty, PageHeader } from "@/shared/ui";

export const dynamic = "force-dynamic";

export default async function Clubs() {
  const u = await requireUser();
  if (u.role !== "TEXTIL_ADMIN") {
    if (u.clubId && can(u, "club.profile", u.clubId)) redirect(`/admin/clubes/${u.clubId}`);
    redirect("/admin");
  }
  const clubs = await db.club.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { campaigns: true, products: true, users: true } }, sports: { include: { sport: true } } } });
  return (
    <>
      <PageHeader eyebrow="Textil" title="Clubes" actions={<Link href="/admin/clubes/nuevo" className="btn btn-primary">Nuevo club</Link>} />
      {clubs.length === 0 ? (
        <Empty>Todavía no hay clubes.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {clubs.map((c) => (
            <Link key={c.id} href={`/admin/clubes/${c.id}`} className="card flex items-center gap-4 p-4 hover:border-ink">
              <span className="grid h-14 w-14 flex-none place-items-center rounded-lg" style={{ background: c.colorPrimary }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.logoUrl && <img src={c.logoUrl} alt="" className="h-11 w-11 object-contain" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-bold uppercase">{c.name}</span>
                <span className="block text-sm text-muted">/club/{c.slug} · {c.sports.map((s) => s.sport.name).join(", ") || "Sin deportes"}</span>
                <span className="block text-sm text-muted">{c._count.campaigns} campañas · {c._count.products} productos · {c._count.users} usuarios</span>
              </span>
              {!c.active && <Badge tone="muted">Inactivo</Badge>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
