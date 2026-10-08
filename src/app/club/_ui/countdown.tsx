"use client";
import { useEffect, useState } from "react";

/** Cuenta regresiva hasta el cierre de la preventa. Sin JS muestra la fecha (fallback del servidor). */
export function Countdown({ to, fallback, className = "" }: { to: string; fallback: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return <span className={className}>{fallback}</span>;
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span className={className}>Preventa cerrada</span>;
  const d = Math.floor(ms / 86400_000), h = Math.floor((ms % 86400_000) / 3600_000), m = Math.floor((ms % 3600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={`num ${className}`} role="timer" aria-label={`Cierra en ${d} días y ${h} horas`}>
      Cierra en {d > 0 ? `${d} d ` : ""}{pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
