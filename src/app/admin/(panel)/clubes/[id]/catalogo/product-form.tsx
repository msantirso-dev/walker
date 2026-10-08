import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { pesosInput } from "@/shared/money";
import type { FormState } from "@/shared/actions-types";
import { KIND_LABEL, FAMILY_LABEL, TECHNIQUE_LABEL, CATALOG_STATUS_LABEL } from "./presets";

type Prod = {
  code: string; name: string; kind: "SIMPLE" | "SET" | "COMBO"; description: string | null; audience: string | null; sportId: string | null; basePrice: number; manufacturingTerms: string | null;
  active: boolean; family: string; technique: string; catalogStatus: string;
  components: { label: string; garmentId: string; printTarget: boolean }[];
};

export function ProductForm({ action, garments, sports, product }: { action: (p: FormState, fd: FormData) => Promise<FormState>; garments: { id: string; code: string; name: string; variant: string | null }[]; sports: { id: string; name: string }[]; product?: Prod }) {
  const comps = product?.components ?? [];
  return (
    <ActionForm action={action} className="grid gap-6">
      <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
        <legend className="px-1 font-display text-lg font-bold uppercase">Producto</legend>
        <div className="field"><label htmlFor="code">Código interno</label><input id="code" name="code" className="input uppercase" defaultValue={product?.code} required /></div>
        <div className="field"><label htmlFor="name">Nombre</label><input id="name" name="name" className="input" defaultValue={product?.name} required /></div>
        <div className="field">
          <label htmlFor="kind">Tipo</label>
          <select id="kind" name="kind" className="input" defaultValue={product?.kind ?? "SIMPLE"}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="basePrice">Precio de lista (ARS)</label><input id="basePrice" name="basePrice" className="input" inputMode="decimal" defaultValue={pesosInput(product?.basePrice)} required /><small>El precio de preventa se define en cada campaña.</small></div>
        <div className="field">
          <label htmlFor="sportId">Deporte</label>
          <select id="sportId" name="sportId" className="input" defaultValue={product?.sportId ?? ""}>
            <option value="">Todos</option>
            {sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="audience">Categoría o público</label><input id="audience" name="audience" className="input" defaultValue={product?.audience ?? ""} placeholder="Ej.: Infantiles y adultos" /></div>
        <div className="field md:col-span-2"><label htmlFor="description">Descripción</label><textarea id="description" name="description" className="input" defaultValue={product?.description ?? ""} /></div>
        <div className="field md:col-span-2"><label htmlFor="manufacturingTerms">Plazo y condiciones de fabricación</label><textarea id="manufacturingTerms" name="manufacturingTerms" className="input" rows={2} defaultValue={product?.manufacturingTerms ?? ""} /></div>
        {product && <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="active" defaultChecked={product.active} className="h-5 w-5" /> Activo</label>}
      </fieldset>

      <fieldset className="card grid gap-3 p-5">
        <legend className="px-1 font-display text-lg font-bold uppercase">Componentes</legend>
        <p className="text-sm text-muted">Cada componente es una prenda fabricable con su propio talle. Un conjunto “camiseta + short” tiene dos. Marcá cuál recibe nombre y número.</p>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <div className="field"><label htmlFor={`c${i}_label`}>Etiqueta {i + 1}</label><input id={`c${i}_label`} name={`c${i}_label`} className="input" defaultValue={comps[i]?.label ?? (i === 0 ? "Camiseta" : "")} /></div>
            <div className="field">
              <label htmlFor={`c${i}_garment`}>Prenda</label>
              <select id={`c${i}_garment`} name={`c${i}_garment`} className="input" defaultValue={comps[i]?.garmentId ?? ""}>
                <option value="">{i === 0 ? "Elegir prenda" : "Sin componente"}</option>
                {garments.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}{g.variant ? ` (${g.variant})` : ""}</option>)}
              </select>
            </div>
            <label className="flex h-11 items-center gap-2 text-sm"><input type="radio" name="printTarget" value={String(i)} defaultChecked={comps[i]?.printTarget ?? i === 0} /> Estampa</label>
          </div>
        ))}
      </fieldset>

      <fieldset className="card grid gap-4 p-5 md:grid-cols-3">
        <legend className="px-1 font-display text-lg font-bold uppercase">Clasificación</legend>
        <div className="field">
          <label htmlFor="family">Familia</label>
          <select id="family" name="family" className="input" defaultValue={product?.family ?? "OTHER"}>
            {Object.entries(FAMILY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <small>Indumentaria de juego, outfit, accesorio. Define la regla de producción sugerida.</small>
        </div>
        <div className="field">
          <label htmlFor="technique">Técnica</label>
          <select id="technique" name="technique" className="input" defaultValue={product?.technique ?? "PENDING"}>
            {Object.entries(TECHNIQUE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <small>Campo separado de la familia (sublimado o no se define por producto).</small>
        </div>
        <div className="field">
          <label htmlFor="catalogStatus">Estado en el catálogo</label>
          <select id="catalogStatus" name="catalogStatus" className="input" defaultValue={product?.catalogStatus ?? "PREPARATION"}>
            {Object.entries(CATALOG_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <small>“Preventa activa” y “preventa cerrada” se actualizan solos al publicar o cerrar campañas.</small>
        </div>
        <p className="text-sm text-muted md:col-span-3">La personalización (nombre, número, leyenda y adicionales) se configura en “Opciones del configurador”, en la ficha del producto.</p>
      </fieldset>
      <SubmitButton className="btn btn-primary justify-self-start">{product ? "Guardar producto" : "Crear producto"}</SubmitButton>
    </ActionForm>
  );
}
