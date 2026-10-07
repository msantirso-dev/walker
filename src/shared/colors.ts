const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v: string) => HEX.test(v);

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Texto legible sobre un color de fondo del club. */
export function readableOn(bg: string): string {
  if (!isHex(bg)) return "#FFFFFF";
  return contrast(bg, "#FFFFFF") >= contrast(bg, "#111111") ? "#FFFFFF" : "#111111";
}

/** Oscurece un color (para hover) mezclándolo con negro. */
export function darken(hex: string, amount = 0.18): string {
  if (!isHex(hex)) return hex;
  const ch = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)));
  return "#" + ch.map((c) => c.toString(16).padStart(2, "0")).join("");
}
