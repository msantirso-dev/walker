"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/db";
import { run, str, opt, bool, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { requireUser, assertCan, actorOf, clientIp } from "@/modules/auth";
import { audit } from "@/modules/audit";
import { sealCredential, maskTail } from "@/modules/payments";

function bank(fd: FormData) {
  const cbu = opt(fd, "bankCbu")?.replace(/\s/g, "") ?? null;
  if (cbu && !/^\d{22}$/.test(cbu)) throw new UserError("El CBU/CVU debe tener 22 dígitos.");
  const alias = opt(fd, "bankAlias");
  if (alias && !/^[A-Za-z0-9.-]{6,20}$/.test(alias)) throw new UserError("Alias inválido (6 a 20 caracteres: letras, números, punto o guion).");
  return { label: str(fd, "label"), bankHolder: opt(fd, "bankHolder"), bankName: opt(fd, "bankName"), bankCbu: cbu, bankAlias: alias?.toUpperCase() ?? null, bankCuit: opt(fd, "bankCuit") };
}

export async function createAccount(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "clubs.manage");
    const clubId = opt(fd, "clubId");
    const data = bank(fd);
    if (data.label.length < 3) throw new UserError("Poné un nombre a la cuenta.");
    const a = await db.paymentAccount.create({ data: { ...data, owner: clubId ? "CLUB" : "TEXTIL", clubId } });
    await audit(actorOf(u, await clientIp()), { entity: "PaymentAccount", entityId: a.id, clubId, action: "account.created", data: { owner: a.owner } });
    revalidatePath("/admin/cuentas");
    return "Cuenta creada.";
  });
}

export async function updateAccount(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireUser();
    assertCan(u, "clubs.manage");
    const data: Record<string, unknown> = bank(fd);
    const token = str(fd, "mpAccessToken");
    const secret = str(fd, "mpWebhookSecret");
    if (token || secret) {
      if (!token || !secret) throw new UserError("Cargá juntos el Access Token y la clave secreta del webhook.");
      if (!/^(APP_USR|TEST)-[\w-]{20,}$/.test(token)) throw new UserError("El Access Token no tiene el formato de Mercado Pago (APP_USR-… o TEST-…).");
      if (secret.length < 16) throw new UserError("La clave secreta del webhook parece incompleta.");
      data.mpAccessTokenEnc = sealCredential(token);
      data.mpWebhookSecretEnc = sealCredential(secret);
      data.mpPublicLabel = `${token.startsWith("TEST") ? "Prueba" : "Producción"} ${maskTail(token)}`;
    }
    if (bool(fd, "mpClear")) Object.assign(data, { mpAccessTokenEnc: null, mpWebhookSecretEnc: null, mpPublicLabel: null });
    const a = await db.paymentAccount.update({ where: { id }, data });
    await audit(actorOf(u, await clientIp()), { entity: "PaymentAccount", entityId: id, clubId: a.clubId, action: token ? "account.mp_credentials" : "account.updated", data: { mp: token ? a.mpPublicLabel : bool(fd, "mpClear") ? "eliminadas" : "sin cambios" } });
    revalidatePath("/admin/cuentas");
    return "Cuenta actualizada.";
  });
}
