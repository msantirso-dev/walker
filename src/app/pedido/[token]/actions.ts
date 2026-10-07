"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { orderByToken } from "@/modules/orders";
import { startOnlinePayment, submitTransfer } from "@/modules/payments";
import { deliverPending } from "@/modules/notifications";
import { run, str, fileBuf, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { allow } from "@/shared/rate-limit";
import type { PaymentKind } from "@/generated/prisma/client";

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function payOnline(token: string, kind: PaymentKind, _prev: FormState, _fd: FormData): Promise<FormState> {
  let url: string | null = null;
  const res = await run(async () => {
    if (!allow(`pay:${await ip()}`, 15, 60_000)) throw new UserError("Demasiados intentos. Esperá un minuto.");
    const o = await orderByToken(token);
    if (!o) throw new UserError("Pedido inexistente.");
    url = await startOnlinePayment(o.id, kind);
  });
  if (url) redirect(url);
  return res;
}

export async function uploadTransfer(token: string, kind: PaymentKind, _prev: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    if (!allow(`upload:${await ip()}`, 10, 10 * 60_000)) throw new UserError("Demasiadas cargas. Esperá unos minutos.");
    const o = await orderByToken(token);
    if (!o) throw new UserError("Pedido inexistente.");
    const file = await fileBuf(fd, "receipt");
    if (!file) throw new UserError("Adjuntá el comprobante (imagen o PDF).");
    const f = fd.get("receipt") as File;
    await submitTransfer(o.id, { kind, operationRef: str(fd, "operationRef"), file, fileName: f.name });
    void deliverPending().catch(() => {});
    return "Recibimos el comprobante. Queda en revisión: te avisamos por correo cuando se apruebe.";
  });
}
