import Link from "next/link";
import { getBrand } from "@/modules/brand";

export const metadata = { title: "Nosotros" };

export default async function About() {
  const b = await getBrand();
  return (
    <main className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-6xl font-extrabold md:text-7xl">Nosotros</h1>
      {b.aboutText ? (
        <div className="mt-6 grid gap-4 text-lg">
          {b.aboutText.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 text-lg">
          <p>
            {b.name} diseña y fabrica indumentaria deportiva para clubes y la vende en preventa, con una tienda propia para cada club.
          </p>
          <p className="text-muted">
            Trabajamos con la comisión del club para armar su línea, fabricamos lo que los socios compran y entregamos la producción completa en la sede.
          </p>
        </div>
      )}
      <Link href="/contacto" className="btn btn-primary mt-10">
        Pedir una reunión
      </Link>
    </main>
  );
}
