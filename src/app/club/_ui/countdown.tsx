"use client";
import { useEffect, useState } from "react";

/**
 * Cuenta regresiva informativa. La hora del servidor gobierna el cierre: el contador se corrige con la
 * diferencia entre el reloj del servidor (serverNow) y el del dispositivo, y nunca decide si una compra vale.
 * Sin JS muestra el texto del servidor (fallback).
 */
export function Countdown({ to, fallback, className = "", label = "Cierra en", ended = "Preventa finalizada", serverNow }: { to: string; fallback: string; className?: string; label?: string; ended?: string; serverNow?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const skew = serverNow ? new Date(serverNow).getTime() - Date.now() : 0;
    setNow(Date.now() + skew);
    const t = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(t);
  }, [serverNow]);
  if (now == null) return <span className={className}>{fallback}</span>;
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span className={className}>{ended}</span>;
  const d = Math.floor(ms / 86400_000), h = Math.floor((ms % 86400_000) / 3600_000), m = Math.floor((ms % 3600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={`num ${className}`} role="timer" aria-live="off">
      {label} {d > 0 ? `${d} d ` : ""}{pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
