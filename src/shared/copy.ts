/** Textos acordados con la empresa. Compartidos entre servidor y cliente. */

/** Texto exacto sobre financiación. No prometer cuotas ni "sin interés". */
export const MP_FINANCING_TEXT = "El pago y las opciones de financiación se gestionan mediante Mercado Pago. Consultá las condiciones disponibles al pagar.";
/** Solo si el producto tiene una curva del muestrario aprobada y disponible. */
export const SAMPLE_TEXT = "Podés probarte el muestrario en el club antes de elegir tu talle.";

/** Confirmación del pedido con anticipo aprobado (texto acordado con el cliente). */
export const CONFIRMATION_TEXT = (min = 30, max = 45) =>
  `Tu pago fue aprobado y tu pedido está en curso. La producción comienza al cierre de la preventa y tiene un plazo estimado de ${min} a ${max} días. Cuando las prendas estén disponibles en el club, recibirás un correo con las instrucciones para retirar y cancelar el saldo.`;
