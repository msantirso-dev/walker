import { redirect } from "next/navigation";

/** Acceso desde el enlace directo de una tienda: conserva el club elegido. */
export default async function ClubLogin({ params, searchParams }: { params: Promise<{ club: string }>; searchParams: Promise<{ next?: string }> }) {
  const { club } = await params;
  const { next } = await searchParams;
  redirect(`/socios/ingresar?${new URLSearchParams({ club, next: next ?? `/club/${club}` })}`);
}
