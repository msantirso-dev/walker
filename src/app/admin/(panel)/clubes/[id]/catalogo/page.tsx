import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan } from "@/modules/auth";
import { db } from "@/shared/db";
import { ars } from "@/shared/money";
import { Badge, Empty, PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { createGarment, createProduct } from "./actions";
import { ProductForm } from "./product-form";
import { GROUP_LABEL, KIND_LABEL, PRESETS } from "./presets";

export const dynamic = "force-dynamic";

export default async function Catalog({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  assertCan(u, "catalog.manage");
  const club = await db.club.findUnique({
    where: { id },
    include: {
      garments: { orderBy: { code: "asc" }, include: { sizes: { orderBy: { sort: "asc" } } } },
      products: { orderBy: { code: "asc" }, include: { components: { include: { garment: true } }, images: { take: 1, orderBy: { sort: "asc" } } } },
      sports: { include: { sport: true } },
    },
  });
  if (!club) notFound();
  return (
    <>
      <PageHeader eyebrow={club.name} title="Catálogo" actions={<Link href={`/admin/clubes/${id}`} className="btn btn-ghost">Volver al club</Link>}>
        Prendas fabricables (con talles y medidas) y productos que se venden (simples, conjuntos y combos).
      </PageHeader>

      <Section title="Productos">
        {club.products.length === 0 ? <Empty>Sin productos.</Empty> : (
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead><tr><th></th><th>Código</th><th>Producto</th><th>Tipo</th><th>Componentes</th><th>Lista</th><th>Estado</th></tr></thead>
              <tbody>
                {club.products.map((p) => (
                  <tr key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <td>{p.images[0] && <img src={p.images[0].url} alt="" className="h-10 w-10 rounded object-cover" />}</td>
                    <td className="font-mono text-sm">{p.code}</td>
                    <td><Link className="font-semibold underline" href={`/admin/clubes/${id}/catalogo/productos/${p.id}`}>{p.name}</Link></td>
                    <td>{KIND_LABEL[p.kind]}</td>
                    <td className="text-sm">{p.components.map((c) => `${c.label} (${c.garment.code})`).join(" + ")}</td>
                    <td className="num">{ars(p.basePrice)}</td>
                    <td>{p.active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="mt-4">
          <summary className="btn btn-primary">Nuevo producto</summary>
          <div className="mt-4">
            {club.garments.length === 0 ? <p className="notice notice-info">Primero cargá al menos una prenda fabricable.</p> : (
              <ProductForm action={createProduct.bind(null, id)} garments={club.garments} sports={club.sports.map((s) => s.sport)} />
            )}
          </div>
        </details>
      </Section>

      <Section title="Prendas fabricables">
        {club.garments.length === 0 ? <Empty>Sin prendas.</Empty> : (
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Código</th><th>Prenda</th><th>Variante</th><th>Talles habilitados</th></tr></thead>
              <tbody>
                {club.garments.map((g) => (
                  <tr key={g.id}>
                    <td className="font-mono text-sm">{g.code}</td>
                    <td><Link className="font-semibold underline" href={`/admin/clubes/${id}/catalogo/prendas/${g.id}`}>{g.name}</Link></td>
                    <td>{g.variant}</td>
                    <td className="text-sm">{g.sizes.filter((s) => s.enabled).map((s) => s.label).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="mt-4">
          <summary className="btn btn-ghost">Nueva prenda</summary>
          <ActionForm action={createGarment.bind(null, id)} className="card mt-4 grid gap-4 p-5 md:grid-cols-2">
            <div className="field"><label htmlFor="gcode">Código</label><input id="gcode" name="code" className="input uppercase" placeholder="CAM-TIT-26" required /></div>
            <div className="field"><label htmlFor="gname">Nombre</label><input id="gname" name="name" className="input" placeholder="Camiseta de juego" required /></div>
            <div className="field"><label htmlFor="gvariant">Variante</label><input id="gvariant" name="variant" className="input" placeholder="Titular, suplente, entrenamiento…" /></div>
            <div className="field"><label htmlFor="gmaterial">Material</label><input id="gmaterial" name="material" className="input" /></div>
            <div className="field md:col-span-2"><label htmlFor="gcare">Recomendaciones de cuidado</label><input id="gcare" name="care" className="input" /></div>
            <div className="field"><label htmlFor="gA">Medida A</label><input id="gA" name="measureA" className="input" defaultValue="Ancho de pecho" /></div>
            <div className="field"><label htmlFor="gB">Medida B</label><input id="gB" name="measureB" className="input" defaultValue="Largo" /></div>
            <input type="hidden" name="measureUnit" value="cm" />
            <div className="field md:col-span-2"><label htmlFor="gnote">Nota de medidas</label><input id="gnote" name="measureNote" className="input" defaultValue="Medidas de la prenda extendida, no del cuerpo." /></div>
            <fieldset className="md:col-span-2">
              <legend className="label mb-2">Talles iniciales</legend>
              <div className="flex flex-wrap gap-4">
                {Object.entries(PRESETS).map(([k, p]) => (
                  <label key={k} className="flex items-center gap-2"><input type="checkbox" name={`preset_${k}`} defaultChecked={k !== "KIDS"} className="h-5 w-5" /> {GROUP_LABEL[p.group]}: {p.labels.join(", ")}</label>
                ))}
              </div>
              <small className="hint">No se asumen equivalencias entre grupos. Después podés agregar, quitar y ordenar talles.</small>
            </fieldset>
            <SubmitButton className="btn btn-primary justify-self-start">Crear prenda</SubmitButton>
          </ActionForm>
        </details>
      </Section>
    </>
  );
}
