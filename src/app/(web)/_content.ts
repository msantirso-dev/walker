/** Textos de la web comercial. Describen el servicio; no mencionan clientes, cifras ni convenios. */

export const STEPS: { title: string; text: (brand: string) => string }[] = [
  { title: "Acordamos el catálogo", text: (b) => `El club y ${b} definen los artículos, la marca propia y el precio al socio de cada uno.` },
  { title: "Activamos la preventa", text: () => "Por producto, deporte y categoría, con fecha y hora de cierre." },
  { title: "Los socios compran", text: () => "Eligen talle y personalización y pagan un anticipo con Mercado Pago." },
  { title: "Fabricamos al cierre", text: () => "Se produce lo vendido, en un plazo estimado de 30 a 45 días." },
  { title: "Entregamos en el club", text: () => "Toda la producción llega junta. Cada socio retira y paga el saldo al club." },
];

export const SIZE_CURVE = [
  { label: "1", hint: "6-8" },
  { label: "2", hint: "10-12" },
  { label: "3", hint: "14-16" },
  ...["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"].map((label) => ({ label, hint: "" })),
];

export const FAQ = (b: string) => [
  {
    q: "¿El club tiene que comprar stock?",
    a: `No hay que comprar stock a ciegas: se fabrica lo vendido en cada preventa. Sí se acuerdan compras iniciales, como el muestrario de talles y, en algunos productos, un mínimo de producción. Todo eso se define antes de empezar.`,
  },
  {
    q: "¿Quién cobra y cuánto paga el socio?",
    a: `El socio paga un anticipo online con Mercado Pago, que cobra ${b}. La diferencia hasta el precio final la paga directamente al club cuando retira. La tienda le muestra siempre cuánto paga ahora y cuánto al club.`,
  },
  {
    q: "¿Se puede pagar en cuotas?",
    a: "El pago y las opciones de financiación se gestionan mediante Mercado Pago. Consultá las condiciones disponibles al pagar.",
  },
  {
    q: "¿Qué ve el club durante la preventa?",
    a: "Un panel de consulta con sus campañas, el avance de ventas, los pedidos por comprador y jugador, los pagos, el saldo a cobrar, la producción y la entrega, con exportación a Excel.",
  },
  {
    q: "¿Qué pasa si un socio se equivoca de talle?",
    a: "Las prendas con nombre o número estampado no admiten cambio voluntario de talle. Para el resto, la política se acuerda con el club. Por eso el muestrario está en la sede para probarse antes de comprar. Las fallas de fabricación se resuelven siempre.",
  },
  {
    q: "¿Cuánto tarda la entrega?",
    a: "La producción empieza al cierre de la preventa y tiene un plazo estimado de 30 a 45 días. La entrega es en la sede del club, todo junto.",
  },
];
