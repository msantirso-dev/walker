import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan, can, ROLE_LABELS } from "@/modules/auth";
import { db } from "@/shared/db";
import { PageHeader, Tabs, Badge, Empty } from "@/shared/ui";
import { ActionForm, ImageInput, SubmitButton } from "@/shared/ui/client";
import { ClubForm } from "../club-form";
import { updateClub, setSports, addCategory, toggleCategory, addPhoto, removePhoto } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClubDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const tab = (await searchParams).tab ?? "perfil";
  const u = await requireUser();
  assertCan(u, "club.profile", id);
  const club = await db.club.findUnique({
    where: { id },
    include: {
      sports: true,
      categories: { orderBy: { sort: "asc" }, include: { sport: true } },
      photos: { orderBy: { sort: "asc" } },
      users: { orderBy: { name: "asc" } },
    },
  });
  if (!club) notFound();
  const textil = can(u, "clubs.manage");
  const sports = await db.sport.findMany({ orderBy: { name: "asc" } });
  const tabs = [
    { key: "perfil", label: "Perfil", href: `/admin/clubes/${id}` },
    { key: "deportes", label: "Deportes y categorías", href: `/admin/clubes/${id}?tab=deportes` },
    { key: "fotos", label: "Fotos", href: `/admin/clubes/${id}?tab=fotos` },
    ...(textil ? [{ key: "catalogo", label: "Catálogo", href: `/admin/clubes/${id}/catalogo` }, { key: "usuarios", label: "Usuarios", href: `/admin/clubes/${id}?tab=usuarios` }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Club"
        title={club.name}
        actions={
          <>
            <Link href={`/club/${club.slug}`} target="_blank" className="btn btn-ghost">Ver tienda</Link>
            {textil && <Link href={`/admin/campanas/nueva?club=${club.id}`} className="btn btn-primary">Nueva campaña</Link>}
          </>
        }
      />
      <Tabs items={tabs} current={tab} />

      {tab === "perfil" && <ClubForm action={updateClub.bind(null, id)} club={club} canSlug={textil} />}

      {tab === "deportes" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="text-2xl font-bold">Deportes</h2>
            {textil ? (
              <ActionForm action={setSports.bind(null, id)} className="mt-3 grid gap-3">
                <div className="flex flex-wrap gap-3">
                  {sports.map((s) => (
                    <label key={s.id} className="flex items-center gap-2"><input type="checkbox" name="sport" value={s.id} defaultChecked={club.sports.some((x) => x.sportId === s.id)} className="h-5 w-5" /> {s.name}</label>
                  ))}
                </div>
                <div className="field"><label htmlFor="newSport">Agregar otro deporte</label><input id="newSport" name="newSport" className="input" placeholder="Ej.: Handball" /></div>
                <SubmitButton className="btn btn-primary justify-self-start">Guardar deportes</SubmitButton>
              </ActionForm>
            ) : (
              <p className="mt-2">{sports.filter((s) => club.sports.some((x) => x.sportId === s.id)).map((s) => s.name).join(", ")}</p>
            )}
          </div>
          <div className="card p-5">
            <h2 className="text-2xl font-bold">Categorías y divisiones</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {club.categories.map((c) => (
                <li key={c.id}>
                  <form action={toggleCategory.bind(null, id, c.id)}>
                    <button className={`badge ${c.active ? "badge-ok" : "badge-muted line-through"}`} title={c.active ? "Desactivar" : "Activar"}>
                      {c.sport?.name ? `${c.sport.name} · ` : ""}{c.name}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Tocá una categoría para activarla o desactivarla en el formulario de compra.</p>
            <ActionForm action={addCategory.bind(null, id)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" resetOnOk>
              <div className="field"><label htmlFor="catName">Nueva categoría</label><input id="catName" name="name" className="input" placeholder="Ej.: M13" /></div>
              <div className="field">
                <label htmlFor="catSport">Deporte</label>
                <select id="catSport" name="sportId" className="input">
                  <option value="">Todos</option>
                  {sports.filter((s) => club.sports.some((x) => x.sportId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <SubmitButton className="btn btn-primary">Agregar</SubmitButton>
            </ActionForm>
          </div>
        </div>
      )}

      {tab === "fotos" && (
        <div className="grid gap-6">
          {club.photos.length === 0 ? <Empty>Sin fotos del club.</Empty> : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {club.photos.map((p) => (
                <li key={p.id} className="card overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? ""} className="aspect-video w-full object-cover" />
                  <div className="flex items-center justify-between gap-2 p-2 text-sm">
                    <span className="truncate">{p.caption}</span>
                    <form action={removePhoto.bind(null, id, p.id)}><button className="text-danger underline">Quitar</button></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addPhoto.bind(null, id)} className="card grid gap-3 p-5" resetOnOk>
            <ImageInput name="photo" label="Nueva foto" />
            <div className="field"><label htmlFor="caption">Descripción</label><input id="caption" name="caption" className="input" /></div>
            <SubmitButton className="btn btn-primary justify-self-start">Subir foto</SubmitButton>
          </ActionForm>
        </div>
      )}

      {tab === "usuarios" && textil && (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead>
            <tbody>
              {club.users.map((x) => (
                <tr key={x.id}><td>{x.name}</td><td>{x.email}</td><td>{ROLE_LABELS[x.role]}</td><td>{x.active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="p-4"><Link href={`/admin/usuarios?club=${id}`} className="btn btn-ghost btn-sm">Gestionar usuarios</Link></div>
        </div>
      )}
    </>
  );
}
