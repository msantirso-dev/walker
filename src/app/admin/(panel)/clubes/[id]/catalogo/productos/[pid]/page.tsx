import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, assertCan } from "@/modules/auth";
import { db } from "@/shared/db";
import { PageHeader, Section } from "@/shared/ui";
import { ActionForm, ImageInput, SubmitButton } from "@/shared/ui/client";
import { addProductImage, updateImage, updateProduct } from "../../actions";
import { ProductForm } from "../../product-form";
import { TAG_LABEL, VIEW_LABEL } from "../../presets";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  const u = await requireUser();
  assertCan(u, "catalog.manage");
  const p = await db.product.findFirst({ where: { id: pid, clubId: id }, include: { components: { orderBy: { sort: "asc" } }, images: { orderBy: { sort: "asc" } } } });
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
      <Section title="Datos del producto">
        <ProductForm action={updateProduct.bind(null, id, pid)} garments={garments} sports={club.sports.map((s) => s.sport)} product={p} />
      </Section>
    </>
  );
}
