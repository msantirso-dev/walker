import { ActionForm, ImageInput, SubmitButton } from "@/shared/ui/client";
import type { FormState } from "@/shared/actions-types";

type Club = {
  name: string; slug: string; shortName: string | null; description: string | null; colorPrimary: string; colorSecondary: string;
  city: string | null; province: string | null; venue: string | null; pickupAddress: string | null; pickupHours: string | null; officeHours: string | null;
  conditions: string | null; whatsapp: string | null; email: string | null; instagram: string | null; facebook: string | null; website: string | null;
  logoUrl: string | null; coverUrl: string | null; active: boolean;
};

function F({ name, label, value, hint, type = "text", textarea, required }: { name: string; label: string; value?: string | null; hint?: string; type?: string; textarea?: boolean; required?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {textarea ? (
        <textarea id={name} name={name} className="input" defaultValue={value ?? ""} rows={3} />
      ) : (
        <input id={name} name={name} type={type} className="input" defaultValue={value ?? ""} required={required} />
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function ClubForm({ action, club, canSlug, isNew }: { action: (p: FormState, fd: FormData) => Promise<FormState>; club?: Club; canSlug: boolean; isNew?: boolean }) {
  return (
    <ActionForm action={action} className="grid gap-6">
      <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
        <legend className="px-1 font-display text-lg font-bold uppercase">Identidad</legend>
        <F name="name" label="Nombre del club" value={club?.name} required />
        <F name="shortName" label="Nombre corto" value={club?.shortName} hint="Aparece en el resumen de la tarjeta (máx. 22)." />
        {canSlug && <F name="slug" label="URL pública" value={club?.slug} hint={isNew ? "Se completa sola si la dejás vacía. Ej.: los-pumas-rugby" : "Cambiarla rompe los enlaces y QR ya difundidos."} />}
        <div className="field md:col-span-2"><label htmlFor="description">Presentación breve</label><textarea id="description" name="description" className="input" rows={3} defaultValue={club?.description ?? ""} maxLength={600} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="field"><label htmlFor="colorPrimary">Color principal</label><input id="colorPrimary" name="colorPrimary" type="color" className="input h-12 p-1" defaultValue={club?.colorPrimary ?? "#0F4D3A"} /></div>
          <div className="field"><label htmlFor="colorSecondary">Color secundario</label><input id="colorSecondary" name="colorSecondary" type="color" className="input h-12 p-1" defaultValue={club?.colorSecondary ?? "#D9A520"} /></div>
        </div>
        <p className="text-sm text-muted md:col-span-2">El texto sobre cada color se elige automáticamente (blanco o negro) para mantener el contraste.</p>
        {!isNew && (
          <>
            <ImageInput name="logo" label="Escudo oficial" current={club?.logoUrl} />
            <ImageInput name="cover" label="Portada" current={club?.coverUrl} hint="Horizontal, mínimo 1200 px de ancho. JPG, PNG o WebP hasta 5 MB." />
          </>
        )}
      </fieldset>
      <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
        <legend className="px-1 font-display text-lg font-bold uppercase">Sede y retiro</legend>
        <F name="city" label="Localidad" value={club?.city} />
        <F name="province" label="Provincia" value={club?.province} />
        <F name="venue" label="Sede" value={club?.venue} />
        <F name="pickupAddress" label="Dirección de retiro" value={club?.pickupAddress} />
        <F name="pickupHours" label="Horarios de retiro" value={club?.pickupHours} />
        <F name="officeHours" label="Horarios de atención" value={club?.officeHours} />
        <div className="field md:col-span-2"><label htmlFor="conditions">Condiciones particulares del club</label><textarea id="conditions" name="conditions" className="input" rows={3} defaultValue={club?.conditions ?? ""} /></div>
      </fieldset>
      <fieldset className="card grid gap-4 p-5 md:grid-cols-2">
        <legend className="px-1 font-display text-lg font-bold uppercase">Contacto y redes</legend>
        <F name="whatsapp" label="WhatsApp" value={club?.whatsapp} hint="Con código de país y área, sin el 15. Ej.: 5491140001450" />
        <F name="email" label="Correo" type="email" value={club?.email} />
        <F name="instagram" label="Instagram" value={club?.instagram} hint="Usuario, sin @" />
        <F name="facebook" label="Facebook" value={club?.facebook} />
        <F name="website" label="Sitio web" value={club?.website} />
        {canSlug && !isNew && (
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="active" defaultChecked={club?.active ?? true} className="h-5 w-5" /> Club activo (tienda visible)</label>
        )}
      </fieldset>
      <SubmitButton className="btn btn-primary justify-self-start">{isNew ? "Crear club" : "Guardar cambios"}</SubmitButton>
    </ActionForm>
  );
}
