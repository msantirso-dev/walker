import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan } from "@/modules/auth";
import { db } from "@/shared/db";
import { PageHeader, Section } from "@/shared/ui";
import { ActionForm, ImageInput, SubmitButton } from "@/shared/ui/client";
import { addProductImage, deleteOptionGroupAction, saveOptionGroupAction, updateImage, updateProduct } from "../../actions";
import { OPTION_ROLE_LABEL, OPTION_TYPE_LABEL } from "@/modules/catalog/admin";
import { CHANGE_POLICY_TEXT } from "@/modules/catalog/options";
import { pesosInput } from "@/shared/money";
import { Badge, Money } from "@/shared/ui";
import { ConfirmAction } from "@/shared/ui/client";
import { ProductForm } from "../../product-form";
import { TAG_LABEL, VIEW_LABEL } from "../../presets";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  const u = await requireUser();
  assertCan(u, "catalog.manage");
  const p = await db.product.findFirst({ where: { id: pid, clubId: id }, include: { components: { orderBy: { sort: "asc" } }, images: { orderBy: { sort: "asc" } }, optionGroups: { orderBy: { sort: "asc" }, include: { values: { orderBy: { sort: "asc" } } } } } });
  if (!p) notFound();
  const [garments, club] = await Promise.all([
    db.garment.findMany({ where: { clubId: id }, orderBy: { code: "asc" } }),
    db.club.findUniqueOrThrow({ where: { id }, include: { sports: { include: { sport: true } } } }),
  ]);
  return (
    <>
      <PageHeader eyebrow={`Producto · ${p.code}`} title={p.name} actions={<Link href={`/admin/clubes/${id}/catalogo`} className="btn btn-ghost">Catálogo</Link>} />
      <Section title="Fotografías">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {p.images.map((im) => (
            <li key={im.id} className="card overflow-hidden">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt={im.alt ?? ""} className="aspect-square w-full object-cover" />
                <span className="tag-photo">{TAG_LABEL[im.tag]}</span>
              </div>
              <form action={updateImage.bind(null, id, im.id)} className="grid gap-2 p-2 text-sm">
                <select name="view" defaultValue={im.view} className="input" aria-label="Vista">{Object.entries(VIEW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <select name="tag" defaultValue={im.tag} className="input" aria-label="Etiqueta">{Object.entries(TAG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <div className="flex items-center gap-2"><input name="sort" type="number" defaultValue={im.sort} className="input w-20" aria-label="Orden" /><label className="flex items-center gap-1"><input type="checkbox" name="delete" /> Quitar</label></div>
                <button className="btn btn-ghost btn-sm">Aplicar</button>
              </form>
            </li>
          ))}
        </ul>
        <ActionForm action={addProductImage.bind(null, id, pid)} className="card mt-4 grid gap-4 p-5 md:grid-cols-2" resetOnOk>
          <ImageInput name="image" label="Nueva foto" />
          <div className="grid gap-3">
            <div className="field"><label htmlFor="view">Vista</label><select id="view" name="view" className="input">{Object.entries(VIEW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="tag">Etiqueta visible</label><select id="tag" name="tag" className="input" defaultValue="DESIGN">{Object.entries(TAG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><small>Distingue foto real, diseño o referencia ante el comprador.</small></div>
            <div className="field"><label htmlFor="alt">Descripción de la imagen</label><input id="alt" name="alt" className="input" placeholder="Ej.: Camiseta titular, espalda" /></div>
          </div>
          <SubmitButton className="btn btn-primary justify-self-start">Subir foto</SubmitButton>
        </ActionForm>
      </Section>
      <Section title="Opciones del configurador">
        <p className="mb-3 text-sm text-muted">
          Grupos que ve el comprador, en orden: elección (ej. Personalización: Sin personalizar / Nombre y número), texto (nombre) o número. Un grupo puede mostrarse solo si en otro se eligió cierto valor.
          Cada adicional separa la parte textil (se cobra en el anticipo) y la parte club (saldo). El reparto está pendiente de definición comercial: marcalo como confirmado solo cuando se acuerde.
        </p>
        <div className="grid gap-3">
          {[...p.optionGroups, null].map((g) => {
            const key = g?.id ?? "new";
            const choiceValues = p.optionGroups.filter((x) => x.type === "CHOICE" && x.id !== g?.id).flatMap((x) => x.values.filter((v) => v.active).map((v) => ({ id: v.id, label: `${x.name}: ${v.label}` })));
            return (
              <details key={key} className="card p-4" open={!g && p.optionGroups.length === 0}>
                <summary className="cursor-pointer">
                  {g ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <b>{g.sort}. {g.name}</b>
                      <Badge tone="muted">{OPTION_TYPE_LABEL[g.type]} · {OPTION_ROLE_LABEL[g.role]}</Badge>
                      {g.required && <Badge tone="info">Obligatorio</Badge>}
                      {g.dependsOnGroupId && <Badge tone="info">Condicional</Badge>}
                      {g.blocksSizeChange && <Badge tone="warn">Sin cambio de talle</Badge>}
                      {g.type !== "CHOICE" && (g.priceTextil + g.priceClub > 0) && <span className="text-sm">+<Money cents={g.priceTextil + g.priceClub} /></span>}
                      {!g.splitConfirmed && (g.priceTextil + g.priceClub > 0 || g.values.some((v) => v.priceTextil + v.priceClub > 0)) && <Badge tone="warn">Reparto textil/club a definir</Badge>}
                    </span>
                  ) : <b>+ Agregar grupo de opciones</b>}
                </summary>
                <ActionForm action={saveOptionGroupAction.bind(null, id, pid, g?.id ?? null)} className="mt-3 grid gap-3 md:grid-cols-4">
                  <div className="field md:col-span-2"><label htmlFor={`gn-${key}`}>Nombre que ve el comprador</label><input id={`gn-${key}`} name="name" className="input" defaultValue={g?.name ?? ""} placeholder="Personalización" /></div>
                  <div className="field"><label htmlFor={`gt-${key}`}>Tipo</label><select id={`gt-${key}`} name="type" className="input" defaultValue={g?.type ?? "CHOICE"}>{Object.entries(OPTION_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div className="field"><label htmlFor={`gr-${key}`}>Rol</label><select id={`gr-${key}`} name="role" className="input" defaultValue={g?.role ?? "OTHER"}>{Object.entries(OPTION_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div className="field"><label htmlFor={`gs-${key}`}>Orden</label><input id={`gs-${key}`} name="sort" type="number" className="input" defaultValue={g?.sort ?? p.optionGroups.length + 1} /></div>
                  <div className="field"><label htmlFor={`gml-${key}`}>Máx. caracteres (texto)</label><input id={`gml-${key}`} name="maxLength" type="number" min={1} max={30} className="input" defaultValue={g?.maxLength ?? ""} /></div>
                  <div className="field"><label htmlFor={`gmin-${key}`}>Número desde</label><input id={`gmin-${key}`} name="numberMin" type="number" min={0} className="input" defaultValue={g?.numberMin ?? ""} /></div>
                  <div className="field"><label htmlFor={`gmax-${key}`}>Número hasta</label><input id={`gmax-${key}`} name="numberMax" type="number" min={0} className="input" defaultValue={g?.numberMax ?? ""} /></div>
                  <div className="field"><label htmlFor={`gpt-${key}`}>Precio textil (texto/número)</label><input id={`gpt-${key}`} name="priceTextil" className="input" inputMode="decimal" defaultValue={pesosInput(g?.priceTextil ?? 0)} /></div>
                  <div className="field"><label htmlFor={`gpc-${key}`}>Precio club (texto/número)</label><input id={`gpc-${key}`} name="priceClub" className="input" inputMode="decimal" defaultValue={pesosInput(g?.priceClub ?? 0)} /></div>
                  <div className="field md:col-span-2"><label htmlFor={`gh-${key}`}>Ayuda</label><input id={`gh-${key}`} name="help" className="input" defaultValue={g?.help ?? ""} /></div>
                  <div className="field md:col-span-4">
                    <label htmlFor={`gv-${key}`}>Valores (elección): una línea por valor · Etiqueta | precio textil | precio club</label>
                    <textarea id={`gv-${key}`} name="values" className="input font-mono text-sm" rows={3} defaultValue={g?.values.filter((v) => v.active).map((v) => `${v.label} | ${pesosInput(v.priceTextil)} | ${pesosInput(v.priceClub)}`).join("\n") ?? ""} placeholder={"Sin personalizar | 0 | 0\nNombre y número | 3000 | 0"} />
                  </div>
                  {choiceValues.length > 0 && (
                    <fieldset className="md:col-span-4">
                      <legend className="label">Mostrar solo si se eligió (condición)</legend>
                      <div className="flex flex-wrap gap-3">
                        {choiceValues.map((v) => <label key={v.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="dependsOnValueIds" value={v.id} defaultChecked={g?.dependsOnValueIds.includes(v.id)} className="h-5 w-5" /> {v.label}</label>)}
                      </div>
                    </fieldset>
                  )}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={g?.required} className="h-5 w-5" /> Obligatorio (si se muestra)</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="blocksSizeChange" defaultChecked={g?.blocksSizeChange ?? false} className="h-5 w-5" /> Completarlo bloquea el cambio de talle</label>
                  <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="splitConfirmed" defaultChecked={g?.splitConfirmed} className="h-5 w-5" /> Reparto textil/club confirmado comercialmente</label>
                  <div className="flex flex-wrap gap-2 md:col-span-4">
                    <SubmitButton className="btn btn-primary">{g ? "Guardar grupo" : "Agregar grupo"}</SubmitButton>
                  </div>
                </ActionForm>
                {g && (
                  <div className="mt-2">
                    <ConfirmAction label="Eliminar grupo" confirmLabel="Los pedidos hechos conservan lo elegido.">
                      <ActionForm action={deleteOptionGroupAction.bind(null, id, pid, g.id)} className=""><SubmitButton className="btn btn-danger btn-sm">Confirmar</SubmitButton></ActionForm>
                    </ConfirmAction>
                  </div>
                )}
              </details>
            );
          })}
        </div>
        {p.optionGroups.some((g) => g.blocksSizeChange) && <p className="mt-2 text-xs text-muted">Texto que ve el comprador: {CHANGE_POLICY_TEXT}</p>}
      </Section>

      <Section title="Datos del producto">
        <ProductForm action={updateProduct.bind(null, id, pid)} garments={garments} sports={club.sports.map((s) => s.sport)} product={p} />
      </Section>
    </>
  );
}
