/**
 * Logo WKR Walkersport. Se pinta con el color del texto (currentColor) mediante una máscara del SVG,
 * así sirve en fondos claros, oscuros y sobre el color de marca sin variantes de archivo.
 */
export function BrandMark({ className = "h-8", title = "WKR Walkersport" }: { className?: string; title?: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      className={`inline-block aspect-[105/44.6] bg-current align-middle ${className}`}
      style={{ WebkitMask: "url(/brand/wkr.svg) center / contain no-repeat", mask: "url(/brand/wkr.svg) center / contain no-repeat" }}
    />
  );
}
