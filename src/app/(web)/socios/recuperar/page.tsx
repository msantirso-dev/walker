import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { memberResetRequestAction } from "../actions";

export const metadata = { title: "Recuperar contraseña" };

export default function MemberRecover() {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-5xl font-extrabold">Recuperar contraseña</h1>
      <p className="mt-2 text-muted">Te enviamos un enlace para elegir una contraseña nueva. Vence en 30 minutos.</p>
      <div className="card mt-6 p-5">
        <ActionForm action={memberResetRequestAction}>
          <div className="field"><label htmlFor="r-email">Correo de tu cuenta</label><input id="r-email" name="email" type="email" className="input" autoComplete="email" required /></div>
          <SubmitButton pendingText="Enviando…">Enviar enlace</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
