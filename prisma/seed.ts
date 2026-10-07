/**
 * Datos de demostración: clubes ficticios, catálogo, campañas y usuarios.
 * Uso: npm run db:seed   (requiere DATABASE_URL y UPLOAD_DIR)
 * Las contraseñas de demostración se imprimen al final. No usar en producción.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type SizeGroup } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const UPLOAD = path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");
const PASSWORD = process.env.SEED_PASSWORD ?? "camada-demo-2026";

// ───────── ilustraciones generadas (rotuladas como "Diseño") ─────────
const JERSEY = "M60 22 L86 13 Q100 26 114 13 L140 22 L184 48 L170 86 L150 76 L150 206 L50 206 L50 76 L30 86 L16 48 Z";
function jerseySvg(o: { base: string; hoop?: string; hoops?: number; stripe?: string; collar: string; bg: string; back?: boolean; label?: string }) {
  let bands = "";
  for (let i = 0; i < (o.hoops ?? 0); i++) bands += `<rect x="0" y="${70 + i * 34}" width="200" height="15" fill="${o.hoop}"/>`;
  if (o.stripe) bands += `<rect x="0" y="96" width="200" height="22" fill="${o.stripe}"/>`;
  const back = o.back ? `<text x="100" y="${o.hoops ? 86 : 70}" text-anchor="middle" font-family="Arial Narrow, Arial" font-weight="700" font-size="16" fill="${o.collar}">${o.label ?? "APELLIDO"}</text><text x="100" y="170" text-anchor="middle" font-family="Arial Narrow, Arial" font-weight="800" font-size="62" fill="${o.collar}" stroke="${o.base}" stroke-width="2">9</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 240 240" width="800" height="800"><rect x="-20" y="-10" width="240" height="240" fill="${o.bg}"/>
<defs><clipPath id="c"><path d="${JERSEY}"/></clipPath></defs><path d="${JERSEY}" fill="${o.base}"/><g clip-path="url(#c)">${bands}${back}</g>
<path d="${o.back ? "M86 13 Q100 18 114 13 L112 20 Q100 24 88 20 Z" : "M86 13 Q100 26 114 13 L110 30 Q100 36 90 30 Z"}" fill="${o.collar}"/><path d="${JERSEY}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>`;
}
function shortSvg(bg: string) {
  const S = "M40 40 H160 L170 190 L112 196 L100 110 L88 196 L30 190 Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" width="800" height="800"><rect width="200" height="230" fill="${bg}"/><path d="${S}" fill="#F3F1EA"/><rect x="40" y="40" width="120" height="14" fill="#0F4D3A"/><path d="${S}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>`;
}
function hoodieSvg(bg: string) {
  const P = "M62 22 L88 14 Q100 22 112 14 L138 22 L170 50 L192 186 L166 192 L150 92 L150 206 L50 206 L50 92 L34 192 L8 186 L30 50 Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 240 240" width="800" height="800"><rect x="-20" y="-10" width="240" height="240" fill="${bg}"/><path d="${P}" fill="#14473A"/><rect x="50" y="190" width="100" height="16" fill="#0E3A2E"/><path d="M100 18 V96" stroke="#D9A520" stroke-width="4"/><circle cx="100" cy="98" r="5" fill="#D9A520"/><path d="M88 14 Q100 30 112 14 L114 34 Q100 40 86 34 Z" fill="#0E3A2E"/><rect x="112" y="64" width="18" height="18" rx="3" fill="#D9A520"/><path d="${P}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>`;
}
function crestSvg(a: string, b: string, text: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 60" width="520" height="600"><path d="M2 4h48v26c0 15-11 23-24 28C13 53 2 45 2 30Z" fill="${b}"/><path d="M7 9h38v21c0 11.5-8.4 18.3-19 22.4C15.4 48.3 7 41.5 7 30Z" fill="${a}"/><text x="26" y="36" text-anchor="middle" font-family="Arial Narrow, Arial" font-weight="800" font-size="20" fill="${b}">${text}</text></svg>`;
}
function coverSvg(a: string, b: string) {
  let hoops = "";
  for (let y = 40; y < 700; y += 104) hoops += `<rect x="0" y="${y}" width="1600" height="12" fill="${b}" opacity=".25"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 700" width="1600" height="700"><rect width="1600" height="700" fill="${a}"/>${hoops}<path d="M0 520 Q400 470 800 520 T1600 520 V700 H0Z" fill="#000" opacity=".18"/><g stroke="#fff" stroke-opacity=".35" stroke-width="4"><line x1="300" y1="0" x2="300" y2="700"/><line x1="1300" y1="0" x2="1300" y2="700"/><line x1="800" y1="0" x2="800" y2="700" stroke-dasharray="20 18"/></g></svg>`;
}

async function asset(rel: string, svg: string, w = 800) {
  const abs = path.join(UPLOAD, "public", rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, await sharp(Buffer.from(svg)).resize({ width: w }).webp({ quality: 86 }).toBuffer());
  return `/files/${rel}`;
}

const KIDS = ["4", "6", "8", "10", "12", "14", "16"];
const NUM = ["1", "2", "3"];
const ALPHA = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const TOP: Record<string, [number, number]> = { "4": [34, 46], "6": [36, 49], "8": [38, 52], "10": [41, 55], "12": [44, 58], "14": [47, 62], "16": [49, 65], "1": [50, 68], "2": [53, 70], "3": [56, 72], S: [50, 70], M: [53, 72], L: [56, 74], XL: [59, 76], "2XL": [62, 78], "3XL": [65, 80], "4XL": [68, 82], "5XL": [71, 84] };
const HOOD: Record<string, [number, number]> = { "4": [36, 44], "6": [38, 47], "8": [40, 50], "10": [43, 53], "12": [46, 56], "14": [49, 60], "16": [51, 63], S: [54, 68], M: [57, 70], L: [60, 72], XL: [63, 74], "2XL": [66, 76], "3XL": [69, 78] };
const SHORT: Record<string, [number, number]> = { "4": [25, 28], "6": [26, 30], "8": [28, 32], "10": [30, 34], "12": [32, 36], "14": [34, 38], "16": [36, 40], S: [38, 42], M: [41, 44], L: [44, 46], XL: [47, 48], "2XL": [50, 50], "3XL": [53, 52] };

function sizes(groups: [SizeGroup, string[]][], chart: Record<string, [number, number]>) {
  let sort = 0;
  return groups.flatMap(([group, list]) => list.map((label) => ({ label, group, sort: (sort += 10), measureA: chart[label]?.[0], measureB: chart[label]?.[1] })));
}

const pesos = (n: number) => n * 100;
const days = (n: number) => new Date(Date.now() + n * 86400_000);

async function main() {
  if ((await db.club.count()) > 0 && process.env.SEED_FORCE !== "1") {
    console.log("La base ya tiene datos: no se cargan los de demostración. Para reemplazarlos (borra todo) usá SEED_FORCE=1.");
    return;
  }
  console.log("Limpiando datos…");
  await db.$executeRawUnsafe(`TRUNCATE "AuditLog","EmailOutbox","WebhookEvent","SimulatedPayment","ProductionLotUnit","ProductionLot","Delivery","Receipt","Payment","OrderUnitComponent","OrderUnit","Player","Order","Buyer","BenefitSettlement","BenefitRule","CampaignProduct","Campaign","ProductImage","ProductComponent","Product","GarmentSize","Garment","PaymentAccount","ClubPhoto","Category","ClubSport","Session","User","Club","Sport" CASCADE`);

  const sports = Object.fromEntries(
    await Promise.all(["Rugby", "Hockey", "Fútbol", "Básquet", "Vóley"].map(async (name) => [name, await db.sport.create({ data: { name } })])),
  );
  const hash = await bcrypt.hash(PASSWORD, 10);

  // ───────── Textil ─────────
  const textilAccount = await db.paymentAccount.create({
    data: { owner: "TEXTIL", label: "Camada Textil (cuenta de muestra)", bankHolder: "Camada Textil S.R.L. (muestra)", bankName: "Banco de muestra", bankCbu: "0000000000000000000001", bankAlias: "CAMADA.TEXTIL.DEMO", bankCuit: "30-00000000-0" },
  });
  await db.user.create({ data: { email: "textil@camada.test", name: "Lucía Paredes (textil)", passwordHash: hash, role: "TEXTIL_ADMIN" } });
  await db.user.create({ data: { email: "produccion@camada.test", name: "Ramiro Sosa (producción)", passwordHash: hash, role: "PRODUCTION" } });

  // ───────── Club 1: Los Ñandúes Rugby Club ─────────
  const G = "#0F4D3A", Y = "#D9A520";
  const club = await db.club.create({
    data: {
      slug: "los-nandues-rugby", name: "Los Ñandúes Rugby Club", shortName: "LNRC",
      description: "Club de rugby y hockey de Benavídez, fundado por familias del barrio. Más de 400 jugadores en infantiles, juveniles, plantel superior y femenino.",
      colorPrimary: G, colorSecondary: Y, city: "Benavídez", province: "Buenos Aires", venue: "Sede Benavídez",
      pickupAddress: "Av. Los Ñandúes 1450, Benavídez, Tigre", pickupHours: "Martes y jueves de 18 a 21 h; sábados de 9 a 13 h",
      officeHours: "Lunes a viernes de 17 a 21 h", conditions: "Las prendas se fabrican a pedido. Los cambios de talle se aceptan hasta el cierre de la preventa.",
      whatsapp: "5491140001450", email: "tienda@losnandues.example", instagram: "losnandues.rc",
      logoUrl: await asset("demo/nandues-logo.webp", crestSvg(G, Y, "LÑ"), 520),
      coverUrl: await asset("demo/nandues-cover.webp", coverSvg(G, Y), 1600),
      sports: { create: [{ sportId: sports.Rugby.id }, { sportId: sports.Hockey.id }] },
    },
  });
  const cats = [
    ...["M8", "M10", "M12", "M14", "M15", "M16", "M17", "M19", "Plantel superior", "Femenino"].map((name, i) => ({ name, sportId: sports.Rugby.id, sort: i })),
    ...["Sub-12", "Sub-14", "Sub-16", "Primera"].map((name, i) => ({ name, sportId: sports.Hockey.id, sort: 20 + i })),
  ];
  await db.category.createMany({ data: cats.map((c) => ({ ...c, clubId: club.id })) });
  await db.clubPhoto.create({ data: { clubId: club.id, url: club.coverUrl!, caption: "Cancha principal" } });
  const clubAccount = await db.paymentAccount.create({
    data: { owner: "CLUB", clubId: club.id, label: "Cuenta del club (muestra)", bankHolder: "Asoc. Civil Los Ñandúes RC (muestra)", bankName: "Banco de muestra", bankCbu: "0000000000000000000002", bankAlias: "NANDUES.PREVENTA.DEMO", bankCuit: "30-11111111-1" },
  });
  await db.user.create({ data: { email: "club@nandues.test", name: "Martín Ferreyra (club)", passwordHash: hash, role: "CLUB_ADMIN", clubId: club.id } });
  await db.user.create({ data: { email: "entregas@nandues.test", name: "Paula Ríos (entregas)", passwordHash: hash, role: "DELIVERY", clubId: club.id } });

  // Prendas fabricables
  const garment = (code: string, name: string, variant: string | null, sz: ReturnType<typeof sizes>, extra: Partial<{ material: string; care: string; measureA: string; measureNote: string }> = {}) =>
    db.garment.create({
      data: {
        clubId: club.id, code, name, variant, material: extra.material ?? "Poliéster 100 % de alta resistencia, sublimado",
        care: extra.care ?? "Lavar con agua fría, del revés, sin suavizante. No planchar sobre el estampado.",
        measureA: extra.measureA ?? "Ancho de pecho", measureB: "Largo", measureNote: extra.measureNote ?? "Medidas de la prenda extendida, no del cuerpo. Tolerancia ± 1 cm.",
        sizes: { create: sz },
      },
    });
  const camTit = await garment("CAM-TIT-26", "Camiseta de juego", "Titular 2026", sizes([["KIDS", KIDS], ["NUMERIC", NUM], ["ALPHA", ALPHA]], TOP));
  const camEnt = await garment("CAM-ENT-26", "Camiseta de entrenamiento", "Blanca 2026", sizes([["KIDS", KIDS], ["ALPHA", ALPHA]], TOP), { material: "Poliéster liviano de secado rápido" });
  const short = await garment("SHO-JUE-26", "Short de juego", "Blanco 2026", sizes([["KIDS", KIDS], ["ALPHA", ALPHA.slice(0, 6)]], SHORT), { measureA: "Medio contorno de cintura", material: "Gabardina deportiva con elástico y cordón" });
  const buzo = await garment("BUZ-MC-26", "Buzo medio cierre", "Verde 2026", sizes([["KIDS", KIDS], ["ALPHA", ALPHA.slice(0, 6)]], HOOD), { material: "Frisa liviana 280 g", care: "Lavar con agua fría. No usar secarropas." });

  const bg = "#E4ECE6";
  const imgTitF = await asset("demo/cam-tit-frente.webp", jerseySvg({ base: G, hoop: Y, hoops: 4, collar: Y, bg }));
  const imgTitB = await asset("demo/cam-tit-espalda.webp", jerseySvg({ base: G, hoop: Y, hoops: 4, collar: Y, bg, back: true }));
  const imgEnt = await asset("demo/cam-ent.webp", jerseySvg({ base: "#F3F1EA", stripe: G, collar: G, bg }));
  const imgShort = await asset("demo/short.webp", shortSvg(bg));
  const imgBuzo = await asset("demo/buzo.webp", hoodieSvg(bg));

  const prod = (data: Parameters<typeof db.product.create>[0]["data"]) => db.product.create({ data });
  const pTit = await prod({
    clubId: club.id, code: "P-CAM-TIT", name: "Camiseta titular 2026", kind: "SIMPLE", sportId: sports.Rugby.id, audience: "Infantiles, juveniles y adultos",
    description: "Aros verde y oro. Tela de juego de alta resistencia, cuello reforzado y escudo sublimado.", basePrice: pesos(56000),
    manufacturingTerms: "Se fabrica a pedido al cierre de la preventa. Entrega estimada de 30 a 40 días.",
    persNameEnabled: true, persNamePrice: pesos(6000), persNameMaxLen: 12, persNumberEnabled: true, persNumberPrice: pesos(4000), persNumberMin: 1, persNumberMax: 99,
    components: { create: [{ garmentId: camTit.id, label: "Camiseta", printTarget: true }] },
    images: { create: [{ url: imgTitF, view: "FRONT", tag: "DESIGN", alt: "Camiseta titular, frente" }, { url: imgTitB, view: "BACK", tag: "DESIGN", alt: "Camiseta titular, espalda con nombre y número", sort: 1 }] },
  });
  const pSet = await prod({
    clubId: club.id, code: "P-CNJ-JUE", name: "Conjunto de juego", kind: "SET", sportId: sports.Rugby.id, audience: "Jugadores",
    description: "Camiseta titular y short de juego. Elegís el talle de cada prenda por separado.", basePrice: pesos(84000),
    persNameEnabled: true, persNamePrice: pesos(6000), persNameMaxLen: 12, persNumberEnabled: true, persNumberPrice: pesos(4000), persNumberMin: 1, persNumberMax: 99,
    components: { create: [{ garmentId: camTit.id, label: "Camiseta", printTarget: true, sort: 0 }, { garmentId: short.id, label: "Short", sort: 1 }] },
    images: { create: [{ url: imgTitF, view: "FRONT", tag: "DESIGN", alt: "Camiseta del conjunto" }, { url: imgShort, view: "DETAIL", tag: "DESIGN", alt: "Short del conjunto", sort: 1 }] },
  });
  const pBuzo = await prod({
    clubId: club.id, code: "P-BUZ-MC", name: "Buzo medio cierre", kind: "SIMPLE", audience: "Toda la familia",
    description: "Frisa liviana, cierre metálico y escudo bordado.", basePrice: pesos(72000),
    components: { create: [{ garmentId: buzo.id, label: "Buzo" }] },
    images: { create: [{ url: imgBuzo, view: "FRONT", tag: "DESIGN", alt: "Buzo medio cierre" }] },
  });
  const pEnt = await prod({
    clubId: club.id, code: "P-CAM-ENT", name: "Camiseta de entrenamiento", kind: "SIMPLE", audience: "Jugadores",
    description: "Blanca con franja verde. Secado rápido para la semana.", basePrice: pesos(39000),
    components: { create: [{ garmentId: camEnt.id, label: "Camiseta" }] },
    images: { create: [{ url: imgEnt, view: "FRONT", tag: "REFERENCE", alt: "Camiseta de entrenamiento (referencia de la temporada anterior)" }] },
  });
  const pCombo = await prod({
    clubId: club.id, code: "P-CMB-TB", name: "Combo camiseta + buzo", kind: "COMBO", audience: "Toda la familia",
    description: "Camiseta titular y buzo medio cierre con precio de combo. Talles independientes.", basePrice: pesos(128000),
    persNameEnabled: true, persNamePrice: pesos(6000), persNameMaxLen: 12, persNumberEnabled: true, persNumberPrice: pesos(4000), persNumberMin: 1, persNumberMax: 99,
    components: { create: [{ garmentId: camTit.id, label: "Camiseta", printTarget: true, sort: 0 }, { garmentId: buzo.id, label: "Buzo", sort: 1 }] },
    images: { create: [{ url: imgTitF, view: "FRONT", tag: "DESIGN", alt: "Camiseta del combo" }, { url: imgBuzo, view: "DETAIL", tag: "DESIGN", alt: "Buzo del combo", sort: 1 }] },
  });

  const faq = [
    { q: "¿Qué pasa si no se llega al mínimo de producción?", a: "El club y la fábrica deciden entre extender la preventa, cancelarla o producir igual, y lo informan por correo. Si se cancela, la devolución de lo pagado se coordina con cada comprador." },
    { q: "¿Puedo comprar para varios hijos en el mismo pedido?", a: "Sí. Cada prenda queda asociada a su jugador, con su deporte y categoría, para ordenar la entrega en el club." },
    { q: "¿Cuándo se confirma mi pedido?", a: "Cuando se acredita la seña. Con transferencia, al aprobarse el comprobante; un comprobante cargado queda en revisión hasta entonces." },
    { q: "¿Cómo pago el saldo?", a: "Con el mismo enlace privado de tu pedido, cuando te avisemos que las prendas llegaron al club." },
  ];
  const campaign = await db.campaign.create({
    data: {
      clubId: club.id, slug: "coleccion-2026", title: "Colección oficial 2026", season: "2026",
      description: "Indumentaria oficial del club, fabricada a pedido. Reservás con una seña del 50 %, la fábrica produce solo lo vendido y retirás en la sede cuando completás el saldo.",
      status: "PUBLISHED", opensAt: days(-3), closesAt: days(24), deliveryDaysMin: 30, deliveryDaysMax: 40,
      paymentAccountId: clubAccount.id, paymentMode: "DEPOSIT", depositType: "PERCENT", depositValue: 50,
      balanceDueText: "Antes del retiro, cuando avisemos que las prendas llegaron al club.",
      minUnits: 60, maxUnits: null, minPolicyText: "Si al cierre hay menos de 60 prendas confirmadas, el club y la fábrica deciden extender la preventa, cancelarla o producir igual. La decisión se informa por correo.",
      pickupEnabled: true, pickupInstructions: "Presentá el código QR de retiro. Puede retirar otra persona con el código.",
      shippingEnabled: true, shippingPrice: pesos(9500), shippingNotes: "Envío a domicilio por correo privado; se cobra con el saldo.",
      memberNumberMode: "OPTIONAL",
      policyChanges: "Cambios de talle hasta el cierre de la preventa, escribiendo al club.",
      policyCancellation: "Podés cancelar sin cargo hasta el cierre. Después, la seña cubre la fabricación iniciada.",
      policyRefunds: "Las devoluciones se coordinan con el club y se registran en el pedido. No hay devoluciones automáticas.",
      faq,
      products: {
        create: [
          { productId: pTit.id, price: pesos(48000), listPrice: pesos(56000), sort: 0 },
          { productId: pSet.id, price: pesos(72000), listPrice: pesos(84000), sort: 1 },
          { productId: pBuzo.id, price: pesos(62000), listPrice: pesos(72000), sort: 2 },
          { productId: pCombo.id, price: pesos(104000), listPrice: pesos(128000), sort: 3 },
          { productId: pEnt.id, price: pesos(34000), listPrice: pesos(39000), sort: 4 },
        ],
      },
      benefitRule: { create: { type: "PERCENT_OF_GARMENTS", value: 800, notes: "8 % sobre el precio de las prendas confirmadas." } },
    },
  });
  await db.campaign.create({
    data: {
      clubId: club.id, slug: "temporada-2025", title: "Temporada 2025", season: "2025", status: "FINISHED",
      description: "Preventa de la temporada anterior.", opensAt: new Date("2025-03-01T03:00:00Z"), closesAt: new Date("2025-03-31T02:59:00Z"),
      paymentAccountId: clubAccount.id, showCatalogWhenClosed: true,
      products: { create: [{ productId: pEnt.id, price: pesos(29000), sort: 0 }] },
    },
  });

  // ───────── Club 2 (para verificar aislamiento) ─────────
  const club2 = await db.club.create({
    data: {
      slug: "el-sauce-hockey", name: "Club Social El Sauce", shortName: "CSES", colorPrimary: "#7A1F3D", colorSecondary: "#F2F2F2",
      city: "San Isidro", province: "Buenos Aires", venue: "Sede Las Lomas", pickupAddress: "Camino del Sauce 300, San Isidro", pickupHours: "Sábados de 10 a 13 h",
      description: "Hockey sobre césped femenino y mixto.", logoUrl: await asset("demo/sauce-logo.webp", crestSvg("#7A1F3D", "#F2F2F2", "ES"), 520),
      coverUrl: await asset("demo/sauce-cover.webp", coverSvg("#7A1F3D", "#F2F2F2"), 1600),
      sports: { create: [{ sportId: sports.Hockey.id }] },
    },
  });
  await db.category.createMany({ data: ["Sub-12", "Sub-14", "Primera"].map((name, i) => ({ name, sportId: sports.Hockey.id, clubId: club2.id, sort: i })) });
  await db.user.create({ data: { email: "club@sauce.test", name: "Carla Méndez (club)", passwordHash: hash, role: "CLUB_ADMIN", clubId: club2.id } });
  const pollera = await db.garment.create({
    data: { clubId: club2.id, code: "POL-JUE-26", name: "Pollera de juego", variant: "Bordó 2026", sizes: { create: sizes([["KIDS", KIDS], ["ALPHA", ALPHA.slice(0, 5)]], SHORT) } },
  });
  const pPol = await db.product.create({
    data: {
      clubId: club2.id, code: "P-POL", name: "Pollera de juego", basePrice: pesos(42000), description: "Pollera bordó con short interno.",
      components: { create: [{ garmentId: pollera.id, label: "Pollera" }] },
      images: { create: [{ url: await asset("demo/pollera.webp", shortSvg("#EFE3E7")), tag: "REFERENCE", alt: "Pollera (referencia)" }] },
    },
  });
  await db.campaign.create({
    data: {
      clubId: club2.id, slug: "hockey-2026", title: "Hockey 2026", season: "2026", status: "PUBLISHED", opensAt: days(-1), closesAt: days(20),
      paymentAccountId: textilAccount.id, paymentMode: "FULL", maxUnits: 40, allowMercadoPago: true, allowTransfer: true,
      products: { create: [{ productId: pPol.id, price: pesos(38000), maxUnits: 25 }] },
    },
  });

  console.log(`
Datos de demostración creados.
  Tienda:       /club/${club.slug}  ·  /club/${club.slug}/${campaign.slug}
  Otro club:    /club/${club2.slug}
  Contraseña de todos los usuarios demo: ${PASSWORD}
    textil@camada.test       Administración textil
    produccion@camada.test   Producción
    club@nandues.test        Administración del club (Los Ñandúes)
    entregas@nandues.test    Entregas (Los Ñandúes)
    club@sauce.test          Administración del club (El Sauce)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
