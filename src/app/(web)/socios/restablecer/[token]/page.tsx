import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { MEMBER_MIN_PASSWORD } from "@/modules/members";
import { memberResetAction } from "../../actions";

export const metadata = { title: "Elegir contraseña" };

export default async function MemberReset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-5xl font-extrabold">Elegí tu contraseña</h1>
      <div className="card mt-6 p-5">
        <ActionForm action={memberResetAction.bind(null, token)}>
          <div className="field"><label htmlFor="p1">Contraseña nueva</label><input id="p1" name="password" type="password" className="input" autoComplete="new-password" minLength={MEMBER_MIN_PASSWORD} required /></div>
          <div className="field"><label htmlFor="p2">Repetila</label><input id="p2" name="confirm" type="password" className="input" autoComplete="new-password" required /></div>
          <SubmitButton pendingText="Guardando…">Guardar contraseña</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
