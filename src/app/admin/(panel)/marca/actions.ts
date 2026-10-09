"use server";
import { revalidatePath } from "next/cache";
import { run, str, fileBuf, bool, type FormState } from "@/shared/actions";
import { requireWriter, actorOf, clientIp, assertCompany } from "@/modules/auth";
import { setFormulaApproval, updateBrand } from "@/modules/brand";
import { saveImage } from "@/modules/storage";

export async function saveBrandAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCompany(u);
    const logo = await fileBuf(fd, "logo");
    const logoUrl = bool(fd, "removeLogo") ? null : logo ? await saveImage(logo, "marca") : undefined;
    await updateBrand(u, actorOf(u, await clientIp()), {
      name: str(fd, "name"), tagline: str(fd, "tagline"), colorPrimary: str(fd, "colorPrimary"), colorAccent: str(fd, "colorAccent"),
      contactEmail: str(fd, "contactEmail"), whatsapp: str(fd, "whatsapp"), instagram: str(fd, "instagram"), aboutText: str(fd, "aboutText"),
      debtBlockDefault: str(fd, "debtBlockDefault"),
    }, logoUrl);
    revalidatePath("/", "layout");
    return "Marca actualizada.";
  });
}

export async function formulaAction(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const u = await requireWriter();
    assertCompany(u);
    const approve = str(fd, "decision") === "approve";
    await setFormulaApproval(u, actorOf(u, await clientIp()), approve, str(fd, "note") || null);
    revalidatePath("/admin/marca");
    return approve ? "Fórmula aprobada: se habilitan los cobros reales." : "Aprobación retirada: los cobros reales quedan bloqueados.";
  });
}
