"use server";
import { redirect } from "next/navigation";
import { run, str, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { loginMember, logoutMember, registerMember, requestMemberReset, resetMemberPassword, safeNext } from "@/modules/members";

export async function memberLoginAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await run(async () => {
    await loginMember(str(fd, "email"), String(fd.get("password") ?? ""));
  });
  if (r?.error) return r;
  redirect(safeNext(str(fd, "next")));
}

export async function memberRegisterAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await run(async () => {
    if (String(fd.get("password")) !== String(fd.get("confirm"))) throw new UserError("La confirmación no coincide con la contraseña.");
    await registerMember({ name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone"), password: String(fd.get("password") ?? "") });
  });
  if (r?.error) return r;
  redirect(safeNext(str(fd, "next")));
}

export async function memberLogoutAction() {
  await logoutMember();
  redirect("/");
}

export async function memberResetRequestAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    await requestMemberReset(str(fd, "email"));
    return "Si hay una cuenta con ese correo, te enviamos un enlace para elegir una contraseña nueva.";
  });
}

export async function memberResetAction(token: string, _: FormState, fd: FormData): Promise<FormState> {
  const r = await run(async () => {
    await resetMemberPassword(token, String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
  });
  if (r?.error) return r;
  redirect("/socios/ingresar?restablecida=1");
}
