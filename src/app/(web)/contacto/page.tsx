import { getBrand } from "@/modules/brand";
import { ContactForm } from "../_ui/contact-form";

export const metadata = { title: "Contacto" };

export default async function Contact() {
  const b = await getBrand();
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1fr_1.4fr]">
      <div>
        <h1 className="text-6xl font-extrabold md:text-7xl">Contacto</h1>
        <p className="mt-5 max-w-[46ch] text-lg text-muted">Pedí una reunión para tu club. Te mostramos la tienda, el panel del club y armamos la propuesta con sus disciplinas y categorías.</p>
        <ul className="mt-6 grid gap-1">
          {b.contactEmail && (
            <li>
              <a className="font-semibold underline" href={`mailto:${b.contactEmail}`}>
                {b.contactEmail}
              </a>
            </li>
          )}
          {b.whatsapp && (
            <li>
              <a className="font-semibold underline" href={`https://wa.me/${b.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener">
                WhatsApp {b.whatsapp}
              </a>
            </li>
          )}
        </ul>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5 md:p-7">
        <ContactForm />
      </div>
    </main>
  );
}
