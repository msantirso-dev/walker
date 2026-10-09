import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { requestMeeting } from "../actions";

/** Solicitud de reunión de un club (queda registrada para la empresa en el panel). */
export function ContactForm() {
  return (
    <ActionForm action={requestMeeting} className="grid gap-4 sm:grid-cols-2" resetOnOk>
      <div className="field">
        <label htmlFor="c-name">Tu nombre</label>
        <input id="c-name" name="name" className="input" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="c-club">Club</label>
        <input id="c-club" name="clubName" className="input" required />
      </div>
      <div className="field">
        <label htmlFor="c-role">Tu rol en el club</label>
        <input id="c-role" name="role" className="input" placeholder="Por ejemplo, comisión directiva o subcomisión" />
      </div>
      <div className="field">
        <label htmlFor="c-city">Localidad</label>
        <input id="c-city" name="city" className="input" autoComplete="address-level2" />
      </div>
      <div className="field">
        <label htmlFor="c-email">Correo</label>
        <input id="c-email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="c-phone">Teléfono o WhatsApp</label>
        <input id="c-phone" name="phone" type="tel" className="input" autoComplete="tel" />
      </div>
      <div className="field sm:col-span-2">
        <label htmlFor="c-msg">¿Qué te gustaría resolver?</label>
        <textarea id="c-msg" name="message" className="input" rows={4} placeholder="Disciplinas, cantidad de jugadores, productos que les interesan, fechas…" />
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor="c-web">No completar</label>
        <input id="c-web" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Enviando…">Pedir una reunión</SubmitButton>
      </div>
    </ActionForm>
  );
}
