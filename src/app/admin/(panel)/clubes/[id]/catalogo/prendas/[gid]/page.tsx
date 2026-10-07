import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan } from "@/modules/auth";
import { db } from "@/shared/db";
import { PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { saveSizes, updateGarment } from "../../actions";
import { GROUP_LABEL } from "../../presets";

export const dynamic = "force-dynamic";

export default async function GarmentPage({ params }: { params: Promise<{ id: string; gid: string }> }) {
  const { id, gid } = await params;
  const u = await requireUser();
  assertCan(u, "catalog.manage");
  const g = await db.garment.findFirst({ where: { id: gid, clubId: id }, include: { sizes: { orderBy: { sort: "asc" } }, components: { include: { product: true } } } });
  if (!g) notFound();
  return (
    <>
      <PageHeader eyebrow={`Prenda · ${g.code}`} title={g.name} actions={<Link href={`/admin/clubes/${id}/catalogo`} className="btn btn-ghost">Catálogo</Link>}>
        {g.components.length ? `Usada en: ${g.components.map((c) => c.product.name).join(", ")}` : "Todavía no se usa en ningún producto."}
      </PageHeader>

      <ActionForm action={updateGarment.bind(null, id, gid)} className="card grid gap-4 p-5 md:grid-cols-2">
        <div className="field"><label htmlFor="code">Código</label><input id="code" name="code" className="input uppercase" defaultValue={g.code} /></div>
        <div className="field"><label htmlFor="name">Nombre</label><input id="name" name="name" className="input" defaultValue={g.name} /></div>
        <div className="field"><label htmlFor="variant">Variante</label><input id="variant" name="variant" className="input" defaultValue={g.variant ?? ""} /></div>
        <div className="field"><label htmlFor="material">Material</label><input id="material" name="material" className="input" defaultValue={g.material ?? ""} /></div>
        <div className="field md:col-span-2"><label htmlFor="care">Cuidado</label><input id="care" name="care" className="input" defaultValue={g.care ?? ""} /></div>
        <div className="field"><label htmlFor="measureA">Medida A</label><input id="measureA" name="measureA" className="input" defaultValue={g.measureA} /></div>
        <div className="field"><label htmlFor="measureB">Medida B</label><input id="measureB" name="measureB" className="input" defaultValue={g.measureB} /></div>
        <div className="field">
          <label htmlFor="measureUnit">Unidad</label>
          <select id="measureUnit" name="measureUnit" className="input" defaultValue={g.measureUnit}><option value="cm">cm</option><option value="pulg">pulgadas</option></select>
        </div>
        <div className="field"><label htmlFor="measureNote">Nota de medidas</label><input id="measureNote" name="measureNote" className="input" defaultValue={g.measureNote ?? ""} /></div>
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="active" defaultChecked={g.active} className="h-5 w-5" /> Activa</label>
        <SubmitButton className="btn btn-primary justify-self-start md:col-span-2">Guardar prenda</SubmitButton>
      </ActionForm>

      <Section title="Talles y tabla de medidas">
        <ActionForm action={saveSizes.bind(null, id, gid)} className="grid gap-4">
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Talle</th><th>Grupo</th><th>Orden</th><th>{g.measureA} ({g.measureUnit})</th><th>{g.measureB} ({g.measureUnit})</th><th>Habilitado</th><th>Quitar</th></tr></thead>
              <tbody>
                {g.sizes.map((s) => (
                  <tr key={s.id}>
                    <td className="font-bold">{s.label}</td>
                    <td className="text-sm text-muted">{GROUP_LABEL[s.group]}</td>
                    <td><input name={`sort_${s.id}`} type="number" className="input w-20" defaultValue={s.sort} aria-label={`Orden ${s.label}`} /></td>
                    <td><input name={`a_${s.id}`} className="input w-24" inputMode="decimal" defaultValue={s.measureA?.toString() ?? ""} aria-label={`${g.measureA} ${s.label}`} /></td>
                    <td><input name={`b_${s.id}`} className="input w-24" inputMode="decimal" defaultValue={s.measureB?.toString() ?? ""} aria-label={`${g.measureB} ${s.label}`} /></td>
                    <td><input type="checkbox" name={`en_${s.id}`} defaultChecked={s.enabled} className="h-5 w-5" aria-label={`Habilitar ${s.label}`} /></td>
                    <td><input type="checkbox" name={`del_${s.id}`} className="h-5 w-5" aria-label={`Quitar ${s.label}`} /></td>
                  </tr>
                ))}
                <tr>
                  <td><input name="new_label" className="input w-20 uppercase" placeholder="Nuevo" aria-label="Nuevo talle" /></td>
                  <td>
                    <select name="new_group" className="input" aria-label="Grupo del nuevo talle" defaultValue="OTHER">
                      {Object.entries(GROUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td><input name="new_sort" type="number" className="input w-20" defaultValue={(g.sizes.at(-1)?.sort ?? 0) + 10} aria-label="Orden del nuevo talle" /></td>
                  <td><input name="new_a" className="input w-24" inputMode="decimal" aria-label="Medida A del nuevo talle" /></td>
                  <td><input name="new_b" className="input w-24" inputMode="decimal" aria-label="Medida B del nuevo talle" /></td>
                  <td colSpan={2} className="text-sm text-muted">Agregar</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted">Quitar un talle no afecta pedidos ya hechos. Para dejar de venderlo sin borrarlo, desmarcá “Habilitado”.</p>
          <SubmitButton className="btn btn-primary justify-self-start">Guardar talles</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
