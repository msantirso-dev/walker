"use server";
import { revalidatePath } from "next/cache";
import { run, str, opt, bool, int, fileBuf, type FormState } from "@/shared/actions";
import { UserError } from "@/shared/errors";
import { parseArLocal } from "@/shared/dates";
import { requireWriter, assertCan, actorOf, clientIp } from "@/modules/auth";
import { saveAgreement } from "@/modules/agreements";
import { saveContract } from "@/modules/storage";
import type { AgreementStatus } from "@/generated/prisma/client";

export async function saveAgreementAction(clubId: string, agreementId: string | null, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCan(u, "agreements.manage");
    const startsAt = parseArLocal(`${str(fd, "startsAt")}T00:00`);
    const endsAt = parseArLocal(`${str(fd, "endsAt")}T23:59`);
    if (!startsAt || !endsAt) throw new UserError("Indicá las fechas de inicio y fin.");
    const status = str(fd, "status") as AgreementStatus;
    if (!["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"].includes(status)) throw new UserError("Estado inválido.");
    const buf = await fileBuf(fd, "contract");
    const file = fd.get("contract");
    const contract = buf ? { ...(await saveContract(buf, clubId)), name: file && typeof file !== "string" ? file.name : "contrato" } : undefined;
    await saveAgreement({ ...actorOf(u, await clientIp()), id: u.id }, clubId, agreementId, {
      status, startsAt, endsAt, exclusive: bool(fd, "exclusive"), brandLine: opt(fd, "brandLine"), samplesCommitted: opt(fd, "samplesCommitted"),
      catalogAgreed: opt(fd, "catalogAgreed"), activationConditions: opt(fd, "activationConditions"), initialPurchases: opt(fd, "initialPurchases"),
      pricingRules: opt(fd, "pricingRules"), notes: opt(fd, "notes"), alertDaysBefore: int(fd, "alertDaysBefore", 60),
    }, contract ? { key: contract.key, name: contract.name } : undefined);
    revalidatePath(`/admin/clubes/${clubId}/acuerdo`);
    return "Acuerdo guardado.";
  });
}
