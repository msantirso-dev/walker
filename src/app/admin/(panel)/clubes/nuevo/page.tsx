import { requireUser, assertCan } from "@/modules/auth";
import { PageHeader } from "@/shared/ui";
import { ClubForm } from "../club-form";
import { createClub } from "../actions";

export default async function NewClub() {
  const u = await requireUser();
  assertCan(u, "clubs.manage");
  return (
    <>
      <PageHeader eyebrow="Clubes" title="Nuevo club">Después de crearlo vas a poder cargar escudo, portada, deportes, catálogo y usuarios.</PageHeader>
      <ClubForm action={createClub} canSlug isNew />
    </>
  );
}
