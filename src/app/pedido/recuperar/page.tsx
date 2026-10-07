import Link from "next/link";
import { headers } from "next/headers";
import { requestOrderLinks } from "@/modules/orders";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { allow } from "@/shared/rate-limit";
import type { FormState } from "@/shared/actions-types";

export const metadata = { title: "Recuperar mi pedido", robots: { index: false } };

async function request(_p: FormState, fd: FormData): Promise<FormState> {
  "use server";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const email = String(fd.get("email") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 150) return { error: "Escribí el correo que usaste al comprar." };
  if (!allow(`links:${ip}`, 5, 15 * 60_000)) return { error: "Demasiadas solicitudes. Esperá unos minutos y volvé a intentar." };
  await requestOrderLinks(email);
  return {
    ok: "Si hay pedidos con ese correo, te enviamos los enlaces en unos minutos. Revisá también la carpeta de spam. Si no llega, escribí al club por WhatsApp con tu nombre y el de los jugadores.",
  };
}

export default function RecoverOrder() {
  return (
    <main className="mx-auto grid min-h-[70dvh] max-w-md content-center px-4 py-10">
      <div className="eyebrow">Mis pedidos</div>
      <h1 className="mt-1 text-5xl font-extrabold">Recuperar el enlace de tu pedido</h1>
      <p className="mt-3 text-muted">El enlace privado es la única forma de ver tu pedido, pagar el saldo y retirar. Te lo reenviamos al correo con el que compraste.</p>
      <div className="card mt-6 p-5">
        <ActionForm action={request}>
          <div className="field">
            <label htmlFor="email">Correo usado en la compra</label>
            <input id="email" name="email" type="email" autoComplete="email" className="input" required />
          </div>
          <SubmitButton className="btn btn-primary w-full" pendingText="Enviando…">Reenviarme los enlaces</SubmitButton>
        </ActionForm>
      </div>
      <Link href="/" className="mt-4 text-sm underline">Volver al inicio</Link>
    </main>
  );
}
