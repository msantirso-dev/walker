import { requireUser, changeOwnPassword, currentSessionHash, ROLE_LABELS, MIN_PASSWORD } from "@/modules/auth";
import { PageHeader } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { run, str } from "@/shared/actions";
import type { FormState } from "@/shared/actions-types";

export const dynamic = "force-dynamic";

async function changePassword(_p: FormState, fd: FormData): Promise<FormState> {
  "use server";
  return run(async () => {
    const u = await requireUser();
    await changeOwnPassword(u.id, await currentSessionHash(), { current: str(fd, "current"), next: str(fd, "next"), confirm: str(fd, "confirm") });
    return "Contraseña actualizada. Se cerraron tus otras sesiones.";
  });
}

export default async function Account() {
  const u = await requireUser();
  return (
    <>
      <PageHeader eyebrow="Mi cuenta" title={u.name}>{u.email} · {ROLE_LABELS[u.role]}</PageHeader>
      <ActionForm action={changePassword} className="card grid max-w-md gap-4 p-5" resetOnOk>
        <h2 className="text-2xl font-bold">Cambiar contraseña</h2>
        <div className="field"><label htmlFor="current">Contraseña actual</label><input id="current" name="current" type="password" autoComplete="current-password" className="input" required /></div>
        <div className="field"><label htmlFor="next">Contraseña nueva</label><input id="next" name="next" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} className="input" required /><small>Mínimo {MIN_PASSWORD} caracteres.</small></div>
        <div className="field"><label htmlFor="confirm">Repetila</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} className="input" required /></div>
        <SubmitButton className="btn btn-primary justify-self-start">Guardar</SubmitButton>
      </ActionForm>
    </>
  );
}
