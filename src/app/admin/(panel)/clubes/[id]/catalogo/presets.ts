import type { SizeGroup } from "@/generated/prisma/client";

export const PRESETS: Record<string, { group: SizeGroup; labels: string[] }> = {
  KIDS: { group: "KIDS", labels: ["4", "6", "8", "10", "12", "14", "16"] },
  NUMERIC: { group: "NUMERIC", labels: ["1", "2", "3"] },
  ALPHA: { group: "ALPHA", labels: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"] },
};

export const GROUP_LABEL: Record<SizeGroup, string> = { KIDS: "Infantiles", NUMERIC: "Numéricos (1, 2, 3)", ALPHA: "Adultos", OTHER: "Otros" };
export const VIEW_LABEL = { FRONT: "Frente", BACK: "Espalda", DETAIL: "Detalle", OTHER: "Otra" } as const;
export const TAG_LABEL = { REAL: "Foto real", DESIGN: "Diseño", REFERENCE: "Referencia" } as const;
export const KIND_LABEL = { SIMPLE: "Simple", SET: "Conjunto", COMBO: "Combo" } as const;

export const FAMILY_LABEL: Record<string, string> = { GAME_KIT: "Indumentaria de juego", OUTFIT: "Outfit / uso diario", ACCESSORY: "Accesorio", OTHER: "Otro" };
export const TECHNIQUE_LABEL: Record<string, string> = { PENDING: "A definir", SUBLIMATED: "Sublimado", NON_SUBLIMATED: "No sublimado", EMBROIDERED: "Bordado", PRINTED: "Estampado", OTHER: "Otra" };
export const CATALOG_STATUS_LABEL: Record<string, string> = { PREPARATION: "En preparación", CATALOG: "Catálogo sin venta", PRESALE: "Preventa activa", PRESALE_CLOSED: "Preventa cerrada", ARCHIVED: "Archivado" };
