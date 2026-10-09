/**
 * Datos de demostración: clubes ficticios, catálogo, campañas y usuarios.
 * Uso: npm run db:seed   (requiere DATABASE_URL y UPLOAD_DIR)
 * Las contraseñas de demostración se imprimen al final. No usar en producción.
 */
import "dotenv/config";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
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

function tankSvg(base: string, trim: string, bg: string) {
  const T = "M70 14 Q100 40 130 14 L146 18 Q144 60 160 74 L160 206 L40 206 L40 74 Q56 60 54 18 Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 240 240" width="800" height="800"><rect x="-20" y="-10" width="240" height="240" fill="${bg}"/><path d="${T}" fill="${base}"/><path d="M70 14 Q100 40 130 14" fill="none" stroke="${trim}" stroke-width="5"/><path d="${T}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>`;
}
function bagSvg(base: string, trim: string, bg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200" width="800" height="667"><rect width="240" height="200" fill="${bg}"/><path d="M80 60 Q80 30 120 30 Q160 30 160 60" fill="none" stroke="${trim}" stroke-width="8"/><rect x="30" y="60" width="180" height="110" rx="26" fill="${base}"/><rect x="30" y="104" width="180" height="12" fill="${trim}"/><rect x="30" y="60" width="180" height="110" rx="26" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>`;
}
/** Leyenda opcional sobre la remera: muestra el lugar donde va el texto, sin marcas reales. */
function teeSvg(base: string, trim: string, bg: string, legend?: string) {
  const P = "M60 22 L86 13 Q100 22 114 13 L140 22 L176 46 L162 74 L148 66 L150 206 L50 206 L52 66 L38 74 L24 46 Z";
  const txt = legend ? `<text x="100" y="118" text-anchor="middle" font-family="Arial Narrow, Arial" font-weight="800" font-size="20" fill="${trim}">${legend}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 240 240" width="800" height="800"><rect x="-20" y="-10" width="240" height="240" fill="${bg}"/><path d="${P}" fill="${base}"/><path d="M86 13 Q100 26 114 13" fill="none" stroke="${trim}" stroke-width="5"/>${txt}<path d="${P}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>`;
}

async function asset(rel: string, svg: string, w = 800) {
  const abs = path.join(UPLOAD, "public", rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, await sharp(Buffer.from(svg)).resize({ width: w }).webp({ quality: 86 }).toBuffer());
  return `/files/${rel}`;
}

/** Copia una foto real (bocetos de la textil) desde prisma/assets al almacenamiento público. */
async function photo(rel: string, file: string) {
  const abs = path.join(UPLOAD, "public", rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await copyFile(path.resolve(process.cwd(), "prisma/assets/virreyes", file), abs);
  return `/files/${rel}`;
}

const KIDS = ["4", "6", "8", "10", "12", "14", "16"];
const NUM = ["1", "2", "3"];
const ALPHA = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const TOP: Record<string, [number, number]> = { "4": [34, 46], "6": [36, 49], "8": [38, 52], "10": [41, 55], "12": [44, 58], "14": [47, 62], "16": [49, 65], "1": [50, 68], "2": [53, 70], "3": [56, 72], S: [50, 70], M: [53, 72], L: [56, 74], XL: [59, 76], "2XL": [62, 78], "3XL": [65, 80], "4XL": [68, 82], "5XL": [71, 84] };
const HOOD: Record<string, [number, number]> = { "4": [36, 44], "6": [38, 47], "8": [40, 50], "10": [43, 53], "12": [46, 56], "14": [49, 60], "16": [51, 63], S: [54, 68], M: [57, 70], L: [60, 72], XL: [63, 74], "2XL": [66, 76], "3XL": [69, 78] };
const SHORT: Record<string, [number, number]> = { "1": [27, 31], "2": [31, 35], "3": [35, 39], "4XL": [56, 54], "5XL": [59, 56], "4": [25, 28], "6": [26, 30], "8": [28, 32], "10": [30, 34], "12": [32, 36], "14": [34, 38], "16": [36, 40], S: [38, 42], M: [41, 44], L: [44, 46], XL: [47, 48], "2XL": [50, 50], "3XL": [53, 52] };
// Catálogo de talles Walkersport (WKR26): [ancho, largo] en cm
const RUN_TOP: Record<string, [number, number]> = { "1": [38, 54], "2": [42, 61], "3": [43.5, 61], S: [46, 71], M: [48, 73], L: [51, 75], XL: [57, 77.5], "2XL": [59, 80], "3XL": [61, 83] };
const BERMUDA: Record<string, [number, number]> = { "1": [50, 34], "2": [54, 38], "3": [55, 40], S: [58, 44], M: [62, 47], L: [64, 49], XL: [66, 51], "2XL": [69, 53], "3XL": [72, 58], "4XL": [76, 60], "5XL": [78, 63] };

function sizes(groups: [SizeGroup, string[]][], chart: Record<string, [number, number]>) {
  let sort = 0;
  return groups.flatMap(([group, list]) => list.map((label) => ({ label, group, sort: (sort += 10), measureA: chart[label]?.[0], measureB: chart[label]?.[1] })));
}

const pesos = (n: number) => n * 100;
const days = (n: number) => new Date(Date.now() + n * 86400_000);

/**
 * Personalización guiada: un grupo de elección y, si se elige "Nombre y número", los campos condicionales.
 * Los adicionales van a la textil por defecto; el reparto queda "a definir" (splitConfirmed = false).
 */
async function persGroups(productId: string, o: { name: number; number: number; sort?: number }) {
  const g = await db.productOptionGroup.create({
    data: {
      productId, name: "Personalización", type: "CHOICE", role: "OTHER", required: false, sort: o.sort ?? 1,
      help: "Las prendas con nombre o número no admiten cambio de talle.",
      values: { create: [{ label: "Nombre y número", sort: 0 }, { label: "Solo número", sort: 1 }] },
    },
    include: { values: true },
  });
  const both = g.values.find((v) => v.label === "Nombre y número")!.id;
  const num = g.values.find((v) => v.label === "Solo número")!.id;
  await db.productOptionGroup.create({
    data: { productId, name: "Nombre estampado", type: "TEXT", role: "NAME", required: true, sort: (o.sort ?? 1) + 1, maxLength: 12, priceTextil: o.name, priceClub: 0, blocksSizeChange: true, dependsOnGroupId: g.id, dependsOnValueIds: [both] },
  });
  await db.productOptionGroup.create({
    data: { productId, name: "Número", type: "NUMBER", role: "NUMBER", required: true, sort: (o.sort ?? 1) + 2, numberMin: 1, numberMax: 99, priceTextil: o.number, priceClub: 0, blocksSizeChange: true, dependsOnGroupId: g.id, dependsOnValueIds: [both, num] },
  });
}

async function main() {
  if ((await db.club.count()) > 0 && process.env.SEED_FORCE !== "1") {
    console.log("La base ya tiene datos: no se cargan los de demostración. Para reemplazarlos (borra todo) usá SEED_FORCE=1.");
    return;
  }
  console.log("Limpiando datos…");
  await db.$executeRawUnsafe(`TRUNCATE "ClubPurchasePayment","ProductionLotPurchaseItem","MemberClub","MemberSession","MemberPasswordReset","Member","Lead","ClubShipment","ClubPurchaseItem","ClubPurchase","ProductSampleLink","SizeSampleItem","SizeSampleSet","ClubAgreement","OrderUnitOption","ProductOptionValue","ProductOptionGroup","PasswordReset","AuditLog","EmailOutbox","WebhookEvent","SimulatedPayment","ProductionLotUnit","ProductionLot","Delivery","Receipt","Payment","OrderUnitComponent","OrderUnit","Player","Order","Buyer","BenefitSettlement","BenefitRule","CampaignProduct","Campaign","ProductImage","ProductComponent","Product","GarmentSize","Garment","PaymentAccount","ClubPhoto","Category","ClubSport","Session","User","Club","Sport" CASCADE`);
  // Marca: valores por defecto (nombre provisorio BACK) y fórmula del anticipo pendiente de aprobación
  await db.brandSettings.upsert({
    where: { id: "brand" },
    create: { id: "brand" },
    update: { name: "BACK", tagline: null, logoUrl: null, colorPrimary: "#1D2B4F", colorAccent: "#E9B949", formulaApprovedAt: null, formulaApprovedById: null, formulaNote: null, debtBlockDefault: "ADDITIONAL_ONLY" },
  });

  const sports = Object.fromEntries(
    await Promise.all(["Rugby", "Hockey", "Fútbol", "Básquet", "Vóley"].map(async (name) => [name, await db.sport.create({ data: { name } })])),
  );
  const hash = await bcrypt.hash(PASSWORD, 10);
  // Socio de demostración (compra en las tiendas; consulta solo sus pedidos)
  await db.member.create({ data: { email: "socio@demo.test", name: "Socio Demo", phone: "11 5555 0000", passwordHash: hash } });

  // ───────── Textil ─────────
  const textilAccount = await db.paymentAccount.create({
    data: { owner: "TEXTIL", label: "Walkersport (cuenta de muestra)", bankHolder: "Walkersport (titular de muestra)", bankName: "Banco de muestra", bankCbu: "0000000000000000000001", bankAlias: "WALKER.TEXTIL.DEMO", bankCuit: "30-00000000-0" },
  });
  await db.user.create({ data: { email: "textil@camada.test", name: "Lucía Paredes (textil)", passwordHash: hash, role: "TEXTIL_ADMIN" } });
  await db.user.create({ data: { email: "produccion@camada.test", name: "Ramiro Sosa (producción)", passwordHash: hash, role: "PRODUCTION" } });

  // ───────── Club 1: Los Ñandúes Rugby Club ─────────
  const G = "#0F4D3A", Y = "#D9A520";
  const club = await db.club.create({
    data: {
      slug: "los-nandues-rugby", name: "Los Ñandúes Rugby Club", shortName: "LNRC", managementPanel: true,
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
    family: "GAME_KIT", technique: "SUBLIMATED", catalogStatus: "PRESALE",
    components: { create: [{ garmentId: camTit.id, label: "Camiseta", printTarget: true }] },
    images: { create: [{ url: imgTitF, view: "FRONT", tag: "DESIGN", alt: "Camiseta titular, frente" }, { url: imgTitB, view: "BACK", tag: "DESIGN", alt: "Camiseta titular, espalda con nombre y número", sort: 1 }] },
  });
  const pSet = await prod({
    clubId: club.id, code: "P-CNJ-JUE", name: "Conjunto de juego", kind: "SET", sportId: sports.Rugby.id, audience: "Jugadores",
    description: "Camiseta titular y short de juego. Elegís el talle de cada prenda por separado.", basePrice: pesos(84000),
    family: "GAME_KIT", technique: "SUBLIMATED", catalogStatus: "PRESALE",
    components: { create: [{ garmentId: camTit.id, label: "Camiseta", printTarget: true, sort: 0 }, { garmentId: short.id, label: "Short", sort: 1 }] },
    images: { create: [{ url: imgTitF, view: "FRONT", tag: "DESIGN", alt: "Camiseta del conjunto" }, { url: imgShort, view: "DETAIL", tag: "DESIGN", alt: "Short del conjunto", sort: 1 }] },
  });
  const pBuzo = await prod({
    clubId: club.id, code: "P-BUZ-MC", name: "Buzo medio cierre", kind: "SIMPLE", audience: "Toda la familia",
    description: "Frisa liviana, cierre metálico y escudo bordado.", basePrice: pesos(72000), family: "OUTFIT", technique: "EMBROIDERED", catalogStatus: "PRESALE",
    components: { create: [{ garmentId: buzo.id, label: "Buzo" }] },
    images: { create: [{ url: imgBuzo, view: "FRONT", tag: "DESIGN", alt: "Buzo medio cierre" }] },
  });
  const pEnt = await prod({
    clubId: club.id, code: "P-CAM-ENT", name: "Camiseta de entrenamiento", kind: "SIMPLE", audience: "Jugadores",
    description: "Blanca con franja verde. Secado rápido para la semana.", basePrice: pesos(39000), family: "OUTFIT", technique: "SUBLIMATED", catalogStatus: "PRESALE",
    components: { create: [{ garmentId: camEnt.id, label: "Camiseta" }] },
    images: { create: [{ url: imgEnt, view: "FRONT", tag: "REFERENCE", alt: "Camiseta de entrenamiento (referencia de la temporada anterior)" }] },
  });
  const pCombo = await prod({
    clubId: club.id, code: "P-CMB-TB", name: "Combo camiseta + buzo", kind: "COMBO", audience: "Toda la familia",
    description: "Camiseta titular y buzo medio cierre con precio de combo. Talles independientes.", basePrice: pesos(128000),
    family: "GAME_KIT", technique: "SUBLIMATED", catalogStatus: "PRESALE",
    components: { create: [{ garmentId: camTit.id, label: "Camiseta", printTarget: true, sort: 0 }, { garmentId: buzo.id, label: "Buzo", sort: 1 }] },
    images: { create: [{ url: imgTitF, view: "FRONT", tag: "DESIGN", alt: "Camiseta del combo" }, { url: imgBuzo, view: "DETAIL", tag: "DESIGN", alt: "Buzo del combo", sort: 1 }] },
  });

  for (const p of [pTit, pSet, pCombo]) await persGroups(p.id, { name: pesos(6000), number: pesos(4000) });

  const faq = [
    { q: "¿Qué pasa si no se llega al mínimo de producción?", a: "El club y la fábrica deciden entre extender la preventa, cancelarla o producir igual, y lo informan por correo. Si se cancela, la devolución de lo pagado se coordina con cada comprador." },
    { q: "¿Puedo comprar para varios hijos en el mismo pedido?", a: "Sí. Cada prenda queda asociada a su jugador, con su deporte y categoría, para ordenar la entrega en el club." },
    { q: "¿Cuándo se confirma mi pedido?", a: "Cuando se acredita el anticipo que pagás con Mercado Pago." },
    { q: "¿Cómo pago el saldo?", a: "El saldo (la diferencia entre el precio al socio y el anticipo) se paga directamente al club, antes de retirar. El club lo registra en el sistema." },
    { q: "¿Hay envío a domicilio?", a: "No. La producción completa se entrega en el club y la retirás en la sede con tu código." },
  ];
  const campaign = await db.campaign.create({
    data: {
      clubId: club.id, slug: "coleccion-2026", title: "Colección oficial 2026", season: "2026",
      description: "Indumentaria oficial del club, fabricada a pedido. Pagás el anticipo con Mercado Pago, la fábrica produce solo lo vendido y retirás en la sede; si hay saldo, se paga al club.",
      status: "PUBLISHED", pricingModel: "TEXTIL_ADVANCE", opensAt: days(-3), closesAt: days(24), deliveryDaysMin: 30, deliveryDaysMax: 40,
      paymentAccountId: textilAccount.id, allowTransfer: false,
      activationRequestedAt: days(-5), activationApprovedAt: days(-4),
      balanceDueText: "Saldo al club, antes del retiro.",
      minUnits: 60, maxUnits: null, minPolicyText: "Si al cierre hay menos de 60 prendas confirmadas, el club y la fábrica deciden extender la preventa, cancelarla o producir igual. La decisión se informa por correo.",
      pickupEnabled: true, pickupInstructions: "Presentá el código QR de retiro. Puede retirar otra persona con el código.",
      shippingEnabled: false,
      memberNumberMode: "OPTIONAL",
      policyChanges: "Cambios de talle hasta el cierre de la preventa, escribiendo al club.",
      policyCancellation: "Podés cancelar sin cargo hasta el cierre. Después, el anticipo cubre la fabricación iniciada.",
      policyRefunds: "Las devoluciones se coordinan con el club y se registran en el pedido. No hay devoluciones automáticas.",
      faq,
      products: {
        create: [
          { productId: pTit.id, textilPrice: pesos(40000), price: pesos(48000), listPrice: pesos(56000), sort: 0 },
          { productId: pSet.id, textilPrice: pesos(60000), price: pesos(72000), listPrice: pesos(84000), sort: 1 },
          { productId: pBuzo.id, textilPrice: pesos(52000), price: pesos(62000), listPrice: pesos(72000), sort: 2 },
          { productId: pCombo.id, textilPrice: pesos(88000), price: pesos(104000), listPrice: pesos(128000), sort: 3 },
          { productId: pEnt.id, textilPrice: pesos(34000), price: pesos(34000), listPrice: pesos(39000), sort: 4 },
        ],
      },
      benefitRule: { create: { type: "PERCENT_OF_GARMENTS", value: 800, notes: "8 % sobre el precio de las prendas confirmadas." } },
    },
  });
  await db.campaign.create({
    data: {
      clubId: club.id, slug: "temporada-2025", title: "Temporada 2025", season: "2025", status: "FINISHED", pricingModel: "LEGACY_DEPOSIT",
      description: "Preventa de la temporada anterior.", opensAt: new Date("2025-03-01T03:00:00Z"), closesAt: new Date("2025-03-31T02:59:00Z"),
      paymentAccountId: clubAccount.id, showCatalogWhenClosed: true,
      products: { create: [{ productId: pEnt.id, price: pesos(29000), sort: 0 }] },
    },
  });

  // Campaña de categoría completa: camiseta de juego para el plantel M15 (cantidad esperada fijada por la textil, no universal)
  const m15 = await db.category.findFirstOrThrow({ where: { clubId: club.id, name: "M15" } });
  const textilUser = await db.user.findFirstOrThrow({ where: { role: "TEXTIL_ADMIN" } });
  await db.campaign.create({
    data: {
      clubId: club.id, slug: "m15-camiseta-de-juego", title: "M15 · camiseta de juego", season: "2026", status: "PUBLISHED", pricingModel: "TEXTIL_ADVANCE",
      description: "Camiseta de juego para el plantel M15. Se produce con la categoría completa o con aprobación de la textil.",
      opensAt: days(-2), closesAt: days(10), paymentAccountId: textilAccount.id, allowTransfer: false, shippingEnabled: false,
      audience: "CATEGORIES", audienceCategories: { connect: [{ id: m15.id }] },
      activationRequestedAt: days(-3), activationApprovedAt: days(-3), activationApprovedById: textilUser.id,
      products: {
        create: [{
          productId: pTit.id, textilPrice: pesos(40000), price: pesos(46000), sort: 0,
          ruleType: "FULL_CATEGORY", ruleCategoryId: m15.id, expectedQty: 11, ruleApprovedAt: days(-3), ruleApprovedById: textilUser.id,
          ruleNote: "Plantel M15: 11 camisetas esperadas.",
        }],
      },
    },
  });
  // Acuerdo privado próximo a vencer (para ver la alerta en el panel de la textil)
  await db.clubAgreement.create({
    data: {
      clubId: club.id, status: "ACTIVE", startsAt: days(-320), endsAt: days(45), exclusive: true, brandLine: `LNRC by BACK`,
      samplesCommitted: "Curva superior e inferior completa en la sede.", catalogAgreed: "Indumentaria de juego, entrenamiento y outfit.",
      activationConditions: "Cada campaña la solicita el club y la autoriza la textil.", pricingRules: "Precio textil por producto; el club define el precio al socio.",
      createdById: textilUser.id,
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
      clubId: club2.id, code: "P-POL", name: "Pollera de juego", basePrice: pesos(42000), description: "Pollera bordó con short interno.", family: "GAME_KIT", catalogStatus: "PRESALE",
      components: { create: [{ garmentId: pollera.id, label: "Pollera" }] },
      images: { create: [{ url: await asset("demo/pollera.webp", shortSvg("#EFE3E7")), tag: "REFERENCE", alt: "Pollera (referencia)" }] },
    },
  });
  await db.campaign.create({
    data: {
      // Modelo anterior (seña/pago total): se conserva para clubes con campañas ya en curso
      clubId: club2.id, slug: "hockey-2026", title: "Hockey 2026", season: "2026", status: "PUBLISHED", pricingModel: "LEGACY_DEPOSIT", opensAt: days(-1), closesAt: days(20),
      paymentAccountId: textilAccount.id, paymentMode: "FULL", maxUnits: 40, allowMercadoPago: true, allowTransfer: true,
      products: { create: [{ productId: pPol.id, price: pesos(38000), maxUnits: 25 }] },
    },
  });


  // ───────── Piloto demostrativo: Virreyes Rugby Club (DEMO) ─────────
  // Bocetos reales de Walkersport para la colección de verano del club (catálogo "Outfit verano WKR27").
  // Precios, stock y condiciones son de ejemplo: la tienda se identifica como demostración y nada se vende.
  const VA = "#17573C", VB = "#E8742B";
  const demo = await db.club.create({
    data: {
      slug: "demo-virreyes-rugby", name: "Virreyes Rugby Club (demo)", shortName: "Virreyes demo", isDemo: true, managementPanel: true,
      description: "Demostración del modelo de preventa con los bocetos de verano que Walkersport preparó para el club. Precios de ejemplo, sujetos a aprobación del club.",
      colorPrimary: VA, colorSecondary: VB, city: "Virreyes", province: "Buenos Aires", venue: "Sede (dato de ejemplo)",
      pickupAddress: "Dirección de retiro a confirmar con el club", pickupHours: "Horarios a confirmar con el club", officeHours: "A confirmar",
      conditions: "Demostración: no se realizan ventas reales.",
      logoUrl: await photo("demo/virreyes-escudo.webp", "escudo.webp"),
      coverUrl: await asset("demo/virreyes-demo-portada.webp", coverSvg(VA, VB), 1600),
      sports: { create: [{ sportId: sports.Rugby.id }, { sportId: sports.Hockey.id }] },
    },
  });
  await db.category.createMany({
    data: [
      ...["M13", "M15", "M17", "M19", "Plantel superior"].map((name, i) => ({ name, sportId: sports.Rugby.id, clubId: demo.id, sort: i })),
      ...["Sub-14", "Primera"].map((name, i) => ({ name, sportId: sports.Hockey.id, clubId: demo.id, sort: 10 + i })),
    ],
  });
  await db.user.create({ data: { email: "club@virreyes-demo.test", name: "Usuario demo (club)", passwordHash: hash, role: "CLUB_ADMIN", clubId: demo.id } });
  // Curva estándar de la textil: 1 (6-8), 2 (10-12), 3 (14-16), S a 5XL. Menos stock de muestrario y prendas que duran más.
  const STD_CURVE: [SizeGroup, string[]][] = [["NUMERIC", NUM], ["ALPHA", ALPHA]];
  const GUIDE = "Medidas en cm del catálogo de talles Walkersport.";
  const vg = (code: string, name: string, sz: ReturnType<typeof sizes>, material: string, measureA: string, measureB: string, measureNote: string) =>
    db.garment.create({ data: { clubId: demo.id, code, name, variant: "Verano WKR27", material, care: "Lavar con agua fría, del revés.", measureA, measureB, measureNote, sizes: { create: sz } } });
  const one = (code: string, name: string, material: string, note?: string) =>
    db.garment.create({ data: { clubId: demo.id, code, name, variant: "Único", material, measureA: "Largo", measureB: "Ancho", measureNote: note, sizes: { create: [{ label: "U", group: "OTHER", sort: 0 }] } } });
  const gRem = await vg("REM-VER", "Remera algodón", sizes(STD_CURVE, RUN_TOP), "Algodón (dato de ejemplo)", "Ancho (sisa)", "Largo", `${GUIDE} Referencia: Remera Run.`);
  const gSho = await vg("BER-VER", "Bermuda", sizes(STD_CURVE, BERMUDA), "Microfibra liviana (dato de ejemplo)", "Ancho", "Largo", GUIDE);
  const gMus = await vg("MUS-VER", "Musculosa run", sizes(STD_CURVE, RUN_TOP), "Poliéster liviano (dato de ejemplo)", "Ancho (sisa)", "Largo", `${GUIDE} Referencia: Remera Run.`);
  const gBol = await one("BOL", "Bolso", "Lona (dato de ejemplo)", "Bolso grande: 75 × 35 × 32 cm (catálogo de talles Walkersport).");
  const gGor = await one("GOR", "Gorra", "Frente sublimado y red trasera (dato de ejemplo)");
  const gPil = await one("PIL", "Piluso", "Gabardina (dato de ejemplo)");
  const gToa = await one("TOA", "Toallón", "Microfibra (dato de ejemplo)");
  const gNec = await one("NEC", "Neceser", "Neoprene (dato de ejemplo)");
  const gPon = await one("PON", "Poncho", "Toalla de algodón con capucha (dato de ejemplo)");
  const sketch = (file: string, alt: string) => photo(`demo/virreyes-${file}`, file).then((url) => ({ create: [{ url, view: "FRONT" as const, tag: "DESIGN" as const, alt: `Boceto Walkersport · ${alt}` }] }));
  const outfit = { clubId: demo.id, kind: "SIMPLE" as const, technique: "PENDING" as const, catalogStatus: "PRESALE" as const };
  const dRem = await prod({
    ...outfit, code: "D-REM", name: "Remera algodón", family: "OUTFIT",
    description: "Remera de algodón verde con franja del club. Admite leyenda de disciplina y nombre. Precio de ejemplo.", basePrice: pesos(13000),
    components: { create: [{ garmentId: gRem.id, label: "Remera", printTarget: true }] },
    images: await sketch("remera.webp", "remera algodón, frente y espalda"),
  });
  const dSho = await prod({
    ...outfit, code: "D-SHO", name: "Bermuda", family: "OUTFIT",
    description: "Bermuda verde con escudo y logo WKR. Precio de ejemplo.", basePrice: pesos(15000),
    components: { create: [{ garmentId: gSho.id, label: "Bermuda", printTarget: true }] },
    images: await sketch("bermuda.webp", "bermuda, frente y espalda"),
  });
  const dMus = await prod({
    ...outfit, code: "D-MUS", name: "Musculosa run", family: "OUTFIT",
    description: "Musculosa para correr con franja naranja. Precio de ejemplo igual al precio textil: sin saldo al club.", basePrice: pesos(9000),
    components: { create: [{ garmentId: gMus.id, label: "Musculosa" }] },
    images: await sketch("musculosa.webp", "musculosa run, frente y espalda"),
  });
  const dBol = await prod({
    ...outfit, code: "D-BOL", name: "Bolso", family: "ACCESSORY",
    description: "Bolso grande negro y verde con escudo; número opcional en el lateral. Precio de ejemplo con recargo del 30 % sobre el precio textil.", basePrice: pesos(19500),
    components: { create: [{ garmentId: gBol.id, label: "Bolso" }] },
    images: await sketch("bolso.webp", "bolso con número"),
  });
  const accessory = async (code: string, name: string, garmentId: string, label: string, file: string, description: string, price: number) =>
    prod({ ...outfit, code, name, family: "ACCESSORY", description, basePrice: pesos(price), components: { create: [{ garmentId, label }] }, images: await sketch(file, name.toLowerCase()) });
  const dGor = await accessory("D-GOR", "Gorra", gGor.id, "Gorra", "gorra.webp", "Gorra trucker con parche del club. Precio de ejemplo.", 10400);
  const dPil = await accessory("D-PIL", "Piluso", gPil.id, "Piluso", "piluso.webp", "Piluso negro con escudo bordado. Precio de ejemplo.", 9100);
  const dToa = await accessory("D-TOA", "Toallón", gToa.id, "Toallón", "toallon.webp", "Toallón con los colores y el escudo del club. Precio de ejemplo.", 14300);
  const dNec = await accessory("D-NEC", "Neceser", gNec.id, "Neceser", "neceser.webp", "Neceser con franjas del club. Precio de ejemplo.", 10400);
  const dPon = await prod({
    ...outfit, code: "D-PON", name: "Poncho", family: "OUTFIT",
    description: "Poncho toalla negro con capucha y bolsillo. Precio de ejemplo.", basePrice: pesos(28600),
    components: { create: [{ garmentId: gPon.id, label: "Poncho" }] },
    images: await sketch("poncho.webp", "poncho con capucha"),
  });
  // Producto que la textil todavía prepara: visible en el catálogo como "pendiente de preventa", sin venta
  await prod({
    clubId: demo.id, code: "D-CAM", name: "Camiseta de juego", kind: "SIMPLE", family: "GAME_KIT", technique: "SUBLIMATED", catalogStatus: "CATALOG",
    description: "Se habilitará por categoría completa. Diseño a definir con el club.", basePrice: pesos(20000),
    components: { create: [{ garmentId: gRem.id, label: "Camiseta" }] },
    images: { create: [{ url: await asset("demo/virreyes-camiseta.webp", jerseySvg({ base: VA, hoop: VB, hoops: 3, collar: VB, bg: "#E8EEF3" })), view: "FRONT", tag: "DESIGN", alt: "Camiseta (diseño provisorio)" }] },
  });

  // Cada artículo admite la leyenda de disciplina (mismo artículo, distinta inscripción). Los adicionales son de la textil.
  const legendFor = (productId: string) =>
    db.productOptionGroup.create({
      data: {
        productId, name: "Leyenda de disciplina", type: "CHOICE", role: "LEGEND", required: false, sort: 1, help: "Se estampa sobre la prenda base.",
        values: { create: ["RUGBY", "HOCKEY"].map((label, i) => ({ label, sort: i, priceTextil: pesos(1500), priceClub: 0 })) },
      },
      include: { values: true },
    });
  const legend = await legendFor(dRem.id);
  for (const p of [dSho, dMus, dBol, dGor, dPil, dToa, dNec, dPon]) await legendFor(p.id);
  await db.productOptionGroup.create({
    data: {
      productId: dBol.id, name: "Número en el lateral", type: "NUMBER", role: "NUMBER", required: false, sort: 2, numberMin: 0, numberMax: 99, priceTextil: pesos(1500), priceClub: 0,
      help: "Opcional, como en el boceto.",
    },
  });
  await db.productOptionGroup.create({
    data: {
      productId: dRem.id, name: "Nombre en la espalda", type: "TEXT", role: "NAME", required: false, sort: 2, maxLength: 12, priceTextil: pesos(2000), priceClub: 0,
      blocksSizeChange: true, dependsOnGroupId: legend.id, dependsOnValueIds: legend.values.map((v) => v.id), help: "Disponible con leyenda. Con nombre, la prenda no admite cambio de talle.",
    },
  });

  // Muestrario comprado por el club: una curva superior (remera) y una inferior (short), 11 talles cada una
  const CURVE = [...NUM, ...ALPHA];
  const initial = await db.clubPurchase.create({
    data: {
      clubId: demo.id, purposes: ["SAMPLE"], committedQty: CURVE.length * 2, paidQty: CURVE.length * 2, sizeStatus: "DEFINED", approvedAt: days(-6), approvedById: textilUser.id,
      notes: "Ejemplo: curva superior (remera) e inferior (bermuda) para probarse en el club.", createdById: textilUser.id,
      items: { create: CURVE.map((l) => ({ sizeLabel: l, quantity: 2 })) },
    },
  });
  const top = await db.sizeSampleSet.create({
    data: {
      clubId: demo.id, kind: "TOP", name: "Curva superior", referenceGarmentId: gRem.id, availability: "AVAILABLE", deliveredAt: days(-5), location: "Secretaría del club (ejemplo)",
      purchaseId: initial.id, items: { create: CURVE.map((l, i) => ({ sizeLabel: l, quantity: 1, sort: i })) },
    },
  });
  const bottom = await db.sizeSampleSet.create({
    data: {
      clubId: demo.id, kind: "BOTTOM", name: "Curva inferior", referenceGarmentId: gSho.id, availability: "AVAILABLE", deliveredAt: days(-5), location: "Secretaría del club (ejemplo)",
      purchaseId: initial.id, items: { create: CURVE.map((l, i) => ({ sizeLabel: l, quantity: 1, sort: i })) },
    },
  });
  await db.productSampleLink.createMany({
    data: [
      { productId: dRem.id, setId: top.id, approved: true, approvedAt: days(-5), approvedById: textilUser.id },
      { productId: dMus.id, setId: top.id, approved: true, approvedAt: days(-5), approvedById: textilUser.id, notes: "Calce equivalente a la remera." },
      { productId: dSho.id, setId: bottom.id, approved: true, approvedAt: days(-5), approvedById: textilUser.id },
    ],
  });
  await db.clubAgreement.create({
    data: {
      clubId: demo.id, status: "DRAFT", startsAt: days(0), endsAt: days(365), exclusive: true, brandLine: `Virreyes by BACK`,
      notes: "Borrador de ejemplo para la demostración. Sin valor contractual.", createdById: textilUser.id,
    },
  });
  const demoCampaign = await db.campaign.create({
    data: {
      clubId: demo.id, slug: "verano-demo", title: "Outfit verano WKR27 · demostración", season: "Verano 2027", status: "PUBLISHED", pricingModel: "TEXTIL_ADVANCE",
      description: "Así se vería una preventa del club: precio textil como anticipo por Mercado Pago, saldo al club y entrega en la sede. Precios de ejemplo.",
      opensAt: days(-1), closesAt: days(30), deliveryDaysMin: 30, deliveryDaysMax: 45, paymentAccountId: textilAccount.id, allowTransfer: false, shippingEnabled: false,
      activationRequestedAt: days(-2), activationApprovedAt: days(-2), activationApprovedById: textilUser.id,
      pickupInstructions: "Retiro en la sede con el código del pedido (ejemplo).",
      policyCancellation: "Demostración: no se realizan ventas reales.",
      faq: [{ q: "¿Es una tienda real?", a: "No. Es una demostración con datos de ejemplo. Los pagos son simulados." }],
      products: {
        create: [
          { productId: dRem.id, textilPrice: pesos(10000), price: pesos(13000), sort: 0, ruleType: "INITIAL_PURCHASE", initialPurchaseMin: 20, initialPurchaseEstimated: true, clubCommitAt: days(-3), ruleApprovedAt: days(-2), ruleApprovedById: textilUser.id, ruleNote: "Mínimo 20; el club compra la diferencia." },
          { productId: dSho.id, textilPrice: pesos(12000), price: pesos(15000), sort: 1 },
          { productId: dMus.id, textilPrice: pesos(9000), price: pesos(9000), sort: 2 },
          { productId: dBol.id, textilPrice: pesos(15000), price: pesos(19500), markupBp: 3000, sort: 3 },
          { productId: dGor.id, textilPrice: pesos(8000), price: pesos(10400), markupBp: 3000, sort: 4 },
          { productId: dPil.id, textilPrice: pesos(7000), price: pesos(9100), markupBp: 3000, sort: 5 },
          { productId: dToa.id, textilPrice: pesos(11000), price: pesos(14300), markupBp: 3000, sort: 6 },
          { productId: dNec.id, textilPrice: pesos(8000), price: pesos(10400), markupBp: 3000, sort: 7 },
          { productId: dPon.id, textilPrice: pesos(22000), price: pesos(28600), markupBp: 3000, sort: 8 },
        ],
      },
    },
  });

  console.log(`
Datos de demostración creados.
  Tienda:       /club/${club.slug}  ·  /club/${club.slug}/${campaign.slug}
  Otro club:    /club/${club2.slug}
  Piloto demo:  /club/${demo.slug}/${demoCampaign.slug}
  Contraseña de todos los usuarios demo: ${PASSWORD}
    textil@camada.test       Administración textil
    produccion@camada.test   Producción
    club@nandues.test        Club en modo consulta (Los Ñandúes)
    entregas@nandues.test    Club, consulta de entregas (Los Ñandúes)
    club@sauce.test          Club en modo consulta (El Sauce)
    club@virreyes-demo.test  Club en modo consulta (piloto demo)
    socio@demo.test          Socio (tiendas y "Mis pedidos")`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
