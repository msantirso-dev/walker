"use client";
import { useEffect } from "react";

/**
 * Presentación progresiva: cada bloque con [data-reveal] aparece una vez al entrar en pantalla.
 * Sin JavaScript o con "reducir movimiento", todo se ve desde el inicio.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-shown", "");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const el of els) {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.setAttribute("data-pending", "");
        io.observe(el);
      }
    }
    return () => io.disconnect();
  }, []);
  return null;
}
