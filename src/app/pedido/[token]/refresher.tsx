"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Mientras se espera la notificación del proveedor, vuelve a consultar el estado (no lo infiere de la redirección). */
export function Refresher({ active }: { active: boolean }) {
  const router = useRouter();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active || n >= 24) return;
    const t = setTimeout(() => {
      router.refresh();
      setN((x) => x + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [active, n, router]);
  if (!active) return null;
  return (
    <p className="notice notice-info" role="status">
      {n < 24 ? "Esperando la confirmación de Mercado Pago. Esta página se actualiza sola." : "Mercado Pago todavía no confirmó el pago. Si pagaste, te avisamos por correo cuando se acredite."}
    </p>
  );
}
