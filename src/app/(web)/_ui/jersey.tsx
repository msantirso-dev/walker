/**
 * Espalda de camiseta: el lugar donde va el nombre y el número. Es la imagen central de la web comercial.
 * Usa los colores de la marca (variables CSS) y el nombre configurado.
 */
export function JerseyBack({ name, number = "10", className = "" }: { name: string; number?: string; className?: string }) {
  const label = name.toUpperCase().slice(0, 12);
  return (
    <svg viewBox="0 0 400 440" className={className} role="img" aria-label={`Espalda de camiseta con el nombre ${name} y el número ${number}`}>
      <defs>
        <clipPath id="jb-body">
          <path d="M118 30 C150 46 250 46 282 30 L360 66 L392 150 L330 172 L326 420 L74 420 L70 172 L8 150 L40 66 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#jb-body)">
        <rect width="400" height="440" fill="var(--brand)" />
        {[176, 230].map((y) => (
          <rect key={y} x="0" y={y + 150} width="400" height="14" fill="var(--accent)" opacity="0.9" />
        ))}
        <rect x="0" y="0" width="400" height="34" fill="var(--accent)" opacity="0.18" />
      </g>
      <path d="M118 30 C150 46 250 46 282 30" fill="none" stroke="var(--accent)" strokeWidth="7" />
      <text x="200" y="118" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="40" letterSpacing="6" fill="var(--brand-ink)">
        {label}
      </text>
      <text x="200" y="318" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="210" fill="var(--brand-ink)" stroke="var(--accent)" strokeWidth="5" paintOrder="stroke">
        {number}
      </text>
    </svg>
  );
}
