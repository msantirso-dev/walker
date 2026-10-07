import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { pesosInput } from "@/shared/money";
import type { FormState } from "@/shared/actions-types";
import { KIND_LABEL } from "./presets";

type Prod = {
  code: string; name: string; kind: "SIMPLE" | "SET" | "COMBO"; description: string | null; audience: string | null; sportId: string | null; basePrice: number; manufacturingTerms: string | null;
  persNameEnabled: boolean; persNamePrice: number; persNameMaxLen: number; persNumberEnabled: boolean; persNumberPrice: number; persNumberMin: number; persNumberMax: number; active: boolean;
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

      <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
        <legend className="px-1 font-display text-lg font-bold uppercase">Personalización por unidad</legend>
        <div className="grid gap-3">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="persNameEnabled" defaultChecked={product?.persNameEnabled} className="h-5 w-5" /> Nombre estampado</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="field"><label htmlFor="persNamePrice">Adicional (ARS)</label><input id="persNamePrice" name="persNamePrice" className="input" inputMode="decimal" defaultValue={pesosInput(product?.persNamePrice ?? 0)} /></div>
            <div className="field"><label htmlFor="persNameMaxLen">Máx. caracteres</label><input id="persNameMaxLen" name="persNameMaxLen" type="number" min={1} max={20} className="input" defaultValue={product?.persNameMaxLen ?? 12} /></div>
          </div>
          <small className="hint">Se admiten letras (con tildes y Ñ), espacios, punto, guion y apóstrofo. Se estampa en mayúsculas.</small>
        </div>
        <div className="grid gap-3">
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="persNumberEnabled" defaultChecked={product?.persNumberEnabled} className="h-5 w-5" /> Número</label>
          <div className="grid grid-cols-3 gap-3">
            <div className="field"><label htmlFor="persNumberPrice">Adicional</label><input id="persNumberPrice" name="persNumberPrice" className="input" inputMode="decimal" defaultValue={pesosInput(product?.persNumberPrice ?? 0)} /></div>
            <div className="field"><label htmlFor="persNumberMin">Desde</label><input id="persNumberMin" name="persNumberMin" type="number" min={0} className="input" defaultValue={product?.persNumberMin ?? 1} /></div>
            <div className="field"><label htmlFor="persNumberMax">Hasta</label><input id="persNumberMax" name="persNumberMax" type="number" min={0} className="input" defaultValue={product?.persNumberMax ?? 99} /></div>
          </div>
        </div>
      </fieldset>
      <SubmitButton className="btn btn-primary justify-self-start">{product ? "Guardar producto" : "Crear producto"}</SubmitButton>
    </ActionForm>
  );
}
