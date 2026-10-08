import { z } from "zod";

/** Lo que envía el navegador. Nunca incluye precios ni importes. */
export const MAX_UNITS_PER_ORDER = 30;
export const MAX_PLAYERS_PER_ORDER = 10;

const text = (max: number) => z.string().trim().max(max);

export const cartSchema = z.object({
  idempotencyKey: z.string().uuid(),
  players: z
    .array(
      z.object({
        key: z.string().min(1).max(20),
        name: text(80).min(2, "Falta el nombre de un jugador"),
        sport: text(40).optional(),
        category: text(40).optional(),
        team: text(40).optional(),
      }),
    )
    .max(MAX_PLAYERS_PER_ORDER),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(40),
        playerKey: z.string().max(20).nullable(),
        sizes: z.record(z.string().max(40), z.string().max(10)),
        /** Opciones del configurador: id de grupo → id de valor (elección) o texto/número */
        options: z.record(z.string().max(40), z.string().trim().max(40)).optional(),
        // Compatibilidad: nombre y número directos (se asignan a los grupos con ese rol)
        persName: text(30).optional(),
        persNumber: text(3).optional(),
        quantity: z.number().int().min(1).max(MAX_UNITS_PER_ORDER),
      }),
    )
    .min(1, "Agregá al menos una prenda"),
  buyer: z.object({
    name: text(100).min(3, "Completá tu nombre y apellido"),
    email: z.string().trim().toLowerCase().email("Revisá el correo").max(150),
    phone: text(30).refine((v) => v.replace(/\D/g, "").length >= 8, "Completá un celular con código de área"),
    memberNumber: text(30).optional(),
  }),
  delivery: z
    .object({
      method: z.enum(["PICKUP", "SHIPPING"]),
      address: text(250).optional(),
    })
    .default({ method: "PICKUP" }),
  notes: text(500).optional(),
  acceptTerms: z.literal(true, { error: "Tenés que aceptar las condiciones de la preventa" }),
  payMethod: z.enum(["MERCADOPAGO", "TRANSFER"]),
  // Solo modelo de seña heredado; en anticipo textil se ignora
  payKind: z.enum(["DEPOSIT", "FULL"]).default("DEPOSIT"),
  /** Aceptación de la política de cambios de prendas personalizadas (versión mostrada) */
  policyVersion: z.string().max(40).optional(),
});

export type CartInput = z.infer<typeof cartSchema>;
