import { getBrand } from "@/modules/brand";

const SIZES = {
  sm: { img: "h-5", text: "text-lg" },
  md: { img: "h-8", text: "text-2xl" },
  lg: { img: "h-10", text: "text-3xl" },
  xl: { img: "h-12", text: "text-4xl" },
} as const;

/**
 * Marca de la empresa: el logo cargado en el panel o, si no hay, el nombre como logotipo tipográfico
 * (toma el color del texto, así sirve sobre fondos claros, oscuros y de marca).
 */
export async function BrandMark({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const b = await getBrand();
  const s = SIZES[size];
  if (b.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={b.logoUrl} alt={b.name} className={`inline-block w-auto object-contain align-middle ${s.img} ${className}`} />;
  }
  return <span className={`inline-block align-middle font-display font-extrabold uppercase leading-none tracking-[0.12em] ${s.text} ${className}`}>{b.name}</span>;
}
