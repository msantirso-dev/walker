import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[60dvh] max-w-lg place-content-center gap-4 px-4 text-center">
      <div className="font-display text-8xl font-extrabold text-muted">404</div>
      <h1 className="text-3xl font-extrabold">No encontramos esta página</h1>
      <p className="text-muted">Puede que el enlace esté incompleto o que la tienda ya no esté publicada.</p>
      <Link href="/" className="btn btn-primary justify-self-center">Ir al inicio</Link>
      <Link href="/pedido/recuperar" className="text-sm underline">¿Buscabas tu pedido? Recuperá el enlace</Link>
    </main>
  );
}
