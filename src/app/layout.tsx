import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { brandStyle, getBrand } from "@/modules/brand";

// La marca (nombre, logo y colores) se edita desde el panel: todas las páginas se generan al pedirlas.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  return {
    title: { default: b.name, template: `%s · ${b.name}` },
    description: b.tagline ?? "Preventa de indumentaria deportiva por club.",
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await getBrand();
  return (
    <html lang="es-AR">
      <body className="min-h-dvh antialiased" style={brandStyle(b) as React.CSSProperties}>
        {children}
      </body>
    </html>
  );
}
