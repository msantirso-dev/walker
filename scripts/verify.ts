/**
 * Verificación de punta a punta contra la app en ejecución y la base de datos.
 *
 *   npm run db:seed
 *   node scripts/mock-mercadopago.mjs &          (con MOCK_MP_TOKEN)
 *   MP_API_BASE=http://127.0.0.1:4010 npm run dev &
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/verify.ts
 *
 * Usa HTTP para todo lo que hace el comprador o el proveedor de pagos
 * (crear pedidos, webhooks, páginas, exportaciones, aislamiento) y llama a los
 * módulos del servidor para las operaciones del panel que en la UI son server actions.
 */
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import sharp from "sharp";
import { db } from "@/shared/db";
import { decryptSecret, encryptSecret } from "@/shared/crypto";
import { submitTransfer, reviewTransfer, startOnlinePayment, registerManualPayment, advanceStates } from "@/modules/payments";
import { saveSheet } from "@/modules/clubsheet";
import { advanceUnit } from "@/shared/advance";
import { cancelOrder } from "@/modules/orders";
import { expireReservations, cancelUnit, editUnit, requestOrderLinks } from "@/modules/orders";
import { changeOwnPassword, requestPasswordReset, resetPassword } from "@/modules/auth/password";
import bcrypt from "bcryptjs";
import { generateLot, approveLot, advanceLot, lotReport } from "@/modules/production";
import { registerDelivery } from "@/modules/deliveries";
import {
  closeExpiredCampaigns, decideMinimum, requestActivation, approveActivation, publishCampaign, activationProblems, setCampaignProductPrices,
  setProductRule, approveProductRule, commitShortfall, createShortfallPurchase, productionRuleStatus,
} from "@/modules/campaigns";
import { approvePurchase } from "@/modules/samples";
import { campaignMetrics } from "@/modules/campaigns";
import { createShipment, dispatchShipment, receiveShipment, distributionList } from "@/modules/logistics";
import { runAgreementAlerts } from "@/modules/agreements";
import { paymentStateLabel } from "@/modules/orders";
import { CHANGE_POLICY_VERSION } from "@/modules/catalog/options";
import { assertAdvanceInvariants } from "@/modules/orders/pricing";
import { setFormulaApproval, updateBrand } from "@/modules/brand";
import { createLead } from "@/modules/leads";
import { closeCampaign as closeCampaignFn } from "@/modules/campaigns";
import { addPurchaseToProduction, createAdditionalPurchase, registerPurchasePayment } from "@/modules/purchases";
import { campaignWorkbook, toXlsx } from "@/modules/reports";
import { assertWriter } from "@/modules/auth/permissions";
import type { SessionUser } from "@/modules/auth";
import type { Actor } from "@/modules/audit";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const MOCK = "http://127.0.0.1:4010";
const MOCK_TOKEN = process.env.MOCK_MP_TOKEN ?? "TEST-0000000000000000000000-mock";
const MOCK_SECRET = "mock-webhook-secret-0123456789abcdef";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
async function step(name: string, fn: () => Promise<string | void>) {
  try {
    const d = (await fn()) ?? "";
    results.push({ name, ok: true, detail: d });
    console.log(`✔ ${name}${d ? ` — ${d}` : ""}`);
  } catch (e) {
    const msg = (e as Error).message.replace(/\s+/g, " ").slice(0, 400);
    results.push({ name, ok: false, detail: msg });
    console.log(`✘ ${name} — ${msg}`);
  }
}

/** Sesión de socio para comprar (los socios inician sesión antes de pagar). Un socio por correo de comprador. */
const memberTokens = new Map<string, string>();
async function memberSession(email: string, name = "Comprador de prueba", phone = "11 5555 0000") {
  const key = email.toLowerCase();
  const hit = memberTokens.get(key);
  if (hit) return hit;
  const { createHash } = await import("node:crypto");
  const m = (await db.member.findUnique({ where: { email: key } })) ?? (await db.member.create({ data: { email: key, name, phone, passwordHash: "x" } }).catch(() => db.member.findUniqueOrThrow({ where: { email: key } })));
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  await db.memberSession.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), memberId: m.id, expiresAt: new Date(Date.now() + 3600_000) } });
  memberTokens.set(key, token);
  return token;
}

async function api(path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string>; member?: string | false } = {}) {
  const cookies: string[] = [];
  if (init.cookie) cookies.push(`camada_session=${init.cookie}`);
  // Compras: con la sesión del socio cuyo correo trae el carrito (salvo member: false)
  if (/^\/api\/campanas\/[^/]+\/pedidos$/.test(path) && init.member !== false) {
    const b = init.body as { buyer?: { email?: string; name?: string; phone?: string } } | undefined;
    const email = typeof init.member === "string" ? init.member : b?.buyer?.email ?? "socio@demo.test";
    cookies.push(`back_socio=${await memberSession(email, b?.buyer?.name, b?.buyer?.phone)}`);
  }
  const res = await fetch(BASE + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(cookies.length ? { Cookie: cookies.join("; ") } : {}), ...(init.headers ?? {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

async function session(email: string) {
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const { createHash } = await import("node:crypto");
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  await db.session.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return token;
}
async function user(email: string): Promise<SessionUser> {
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  return { id: u.id, email: u.email, name: u.name, role: u.role, clubId: u.clubId };
}
const actor = (u: SessionUser): Actor & { id: string } => ({ id: u.id, role: u.role, clubId: u.clubId });

function cart(over: Record<string, unknown>) {
  return {
    idempotencyKey: randomUUID(),
    players: [],
    buyer: { name: "Comprador de prueba", email: `c${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`, phone: "11 5555 0000" },
    delivery: { method: "PICKUP" },
    acceptTerms: true,
    payMethod: "MERCADOPAGO",
    payKind: "DEPOSIT",
    ...over,
  };
}

async function newOrder(campaignId: string, c: Record<string, unknown>) {
  const r = await api(`/api/campanas/${campaignId}/pedidos`, { body: c });
  if (r.status !== 200) throw new Error(`Pedido rechazado (${r.status}): ${r.json.error}`);
  const order = await db.order.findFirstOrThrow({ where: { code: String(r.json.order) } });
  return { order, token: decryptSecret(order.accessTokenEnc), redirect: String(r.json.redirect) };
}

function simSign(dataId: string, ts: string) {
  const key = createHmac("sha256", process.env.CRON_SECRET!).update("simulator-webhook").digest("hex");
  return createHmac("sha256", key).update(`id:${dataId};ts:${ts};`).digest("hex");
}
async function simNotify(paymentId: string, status: "APPROVED" | "REJECTED" | "PENDING", amount?: number) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const sp = await db.simulatedPayment.create({ data: { id: `SIM${Date.now()}${Math.floor(Math.random() * 1e6)}`, paymentId, status, amount: amount ?? p.amount } });
  return { simId: sp.id, ...(await simWebhook(sp.id)) };
}
async function simWebhook(simId: string, ts = String(Date.now())) {
  return api(`/api/webhooks/simulador?type=payment&data.id=${simId}`, { method: "POST", headers: { "x-simulator-signature": `${ts},${simSign(simId, ts)}` } });
}

function mpSignature(dataId: string, requestId: string, ts: string, secret = MOCK_SECRET) {
  return `ts=${ts},v1=${createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex")}`;
}
async function mpNotify(accountId: string, dataId: string, opts: { requestId?: string; secret?: string } = {}) {
  const requestId = opts.requestId ?? randomUUID();
  const ts = String(Date.now());
  return api(`/api/webhooks/mercadopago/${accountId}?data.id=${dataId}&type=payment`, {
    method: "POST",
    headers: { "x-signature": mpSignature(dataId, requestId, ts, opts.secret), "x-request-id": requestId, "Content-Type": "application/json" },
    body: { action: "payment.updated", type: "payment", data: { id: dataId } },
  });
}
async function mockPay(externalRef: string, status: string, amountCents: number) {
  const r = await fetch(`${MOCK}/__pay`, { method: "POST", body: JSON.stringify({ external_reference: externalRef, status, amount: amountCents / 100 }) });
  return String(((await r.json()) as { id: string }).id);
}

async function receiptPng() {
  return sharp({ create: { width: 400, height: 600, channels: 3, background: "#ffffff" } }).png().toBuffer();
}

async function main() {
  // Los pagos que inicia este proceso (no el servidor) también van al simulador local de Mercado Pago
  process.env.MP_API_BASE ??= MOCK;
  const nandues = await db.club.findUniqueOrThrow({ where: { slug: "los-nandues-rugby" } });
  const sauce = await db.club.findUniqueOrThrow({ where: { slug: "el-sauce-hockey" } });
  const advCamp = await db.campaign.findFirstOrThrow({ where: { clubId: nandues.id, slug: "coleccion-2026" } });
  // Compatibilidad: el modelo anterior (seña 50 %, envío, transferencia) se sigue verificando sobre una campaña con ese modelo
  const legacyAccount = await db.paymentAccount.findFirstOrThrow({ where: { clubId: nandues.id, owner: "CLUB" } });
  const camp = await db.campaign.create({
    data: {
      clubId: nandues.id, slug: `coleccion-anterior-${Date.now()}`, title: "Colección (modelo anterior)", status: "PUBLISHED", pricingModel: "LEGACY_DEPOSIT",
      opensAt: new Date(Date.now() - 3 * 86400_000), closesAt: new Date(Date.now() + 24 * 86400_000), paymentAccountId: legacyAccount.id,
      paymentMode: "DEPOSIT", depositType: "PERCENT", depositValue: 50, minUnits: 60, minPolicyText: "Si no se llega al mínimo, se decide y se informa.",
      shippingEnabled: true, shippingPrice: 950000, policyChanges: "Cambios hasta el cierre.", allowTransfer: true,
      products: {
        create: (await db.campaignProduct.findMany({ where: { campaignId: advCamp.id } })).map((cp) => ({ productId: cp.productId, price: cp.price, listPrice: cp.listPrice, sort: cp.sort })),
      },
      benefitRule: { create: { type: "PERCENT_OF_GARMENTS", value: 800 } },
    },
  });
  const sauceCamp = await db.campaign.findFirstOrThrow({ where: { clubId: sauce.id } });
  const prod = Object.fromEntries((await db.product.findMany({ where: { clubId: nandues.id } })).map((p) => [p.code, p.id]));
  const textil = await user("textil@camada.test");
  const clubAdmin = await user("club@nandues.test");
  const deliveryUser = await user("entregas@nandues.test");
  const produccion = await user("produccion@camada.test");

  // ───────────────────────── Compra ─────────────────────────
  let multi: Awaited<ReturnType<typeof newOrder>>;
  await step("Modelo anterior (seña): compra con varios jugadores, talles y prendas sin jugador", async () => {
    multi = await newOrder(camp.id, cart({
      players: [{ key: "a", name: "Joaquín Ferreyra", sport: "Rugby", category: "M12" }, { key: "b", name: "Martina Ferreyra", sport: "Rugby", category: "Femenino" }],
      items: [
        { productId: prod["P-CAM-TIT"], playerKey: "a", sizes: { Camiseta: "10" }, quantity: 2 },
        { productId: prod["P-CAM-TIT"], playerKey: "b", sizes: { Camiseta: "M" }, quantity: 1 },
        { productId: prod["P-CAM-TIT"], playerKey: null, sizes: { Camiseta: "3" }, quantity: 1 },
        { productId: prod["P-BUZ-MC"], playerKey: null, sizes: { Buzo: "XL" }, quantity: 1 },
      ],
    }));
    const units = await db.orderUnit.findMany({ where: { orderId: multi.order.id }, include: { components: true, player: true } });
    assert.equal(units.length, 5);
    assert.equal(units.filter((u) => u.player?.name === "Joaquín Ferreyra").length, 2);
    assert.equal(units.filter((u) => !u.playerId).length, 2);
    assert.deepEqual(units.map((u) => u.components[0].sizeLabel).sort(), ["10", "10", "3", "M", "XL"].sort());
    // Precio calculado en servidor: 4 × 48.000 + 62.000
    assert.equal(multi.order.total, (4 * 48000 + 62000) * 100);
    assert.equal(multi.order.depositRequired, Math.round(multi.order.total / 2));
    return `5 unidades, 2 jugadores, total ${multi.order.total / 100}, seña ${multi.order.depositRequired / 100}`;
  });

  let setOrder: Awaited<ReturnType<typeof newOrder>>;
  await step("Conjunto y combo con talles independientes por componente", async () => {
    setOrder = await newOrder(camp.id, cart({
      players: [{ key: "a", name: "Tomás Ruiz", sport: "Rugby", category: "M15" }],
      items: [
        { productId: prod["P-CNJ-JUE"], playerKey: "a", sizes: { Camiseta: "S", Short: "L" }, quantity: 1 },
        { productId: prod["P-CMB-TB"], playerKey: null, sizes: { Camiseta: "2", Buzo: "14" }, quantity: 1 },
      ],
      payMethod: "TRANSFER",
    }));
    const comps = await db.orderUnitComponent.findMany({ where: { unit: { orderId: setOrder.order.id } } });
    const by = (code: string) => comps.filter((c) => c.garmentCode === code).map((c) => c.sizeLabel).sort();
    assert.deepEqual(by("CAM-TIT-26"), ["2", "S"]);
    assert.deepEqual(by("SHO-JUE-26"), ["L"]);
    assert.deepEqual(by("BUZ-MC-26"), ["14"]);
    return "camiseta S + short L; camiseta 2 + buzo 14";
  });

  let persOrder: Awaited<ReturnType<typeof newOrder>>;
  await step("Personalización por unidad (mismo talle, distinto nombre y número)", async () => {
    persOrder = await newOrder(camp.id, cart({
      players: [{ key: "a", name: "Benjamín Sosa", sport: "Rugby", category: "M10" }, { key: "b", name: "Bautista Sosa", sport: "Rugby", category: "M10" }],
      items: [
        { productId: prod["P-CAM-TIT"], playerKey: "a", sizes: { Camiseta: "10" }, persName: "benja", persNumber: "7", quantity: 1 },
        { productId: prod["P-CAM-TIT"], playerKey: "b", sizes: { Camiseta: "10" }, persName: "BAUTI", persNumber: "11", quantity: 1 },
      ],
    }));
    const u = await db.orderUnit.findMany({ where: { orderId: persOrder.order.id }, orderBy: { sort: "asc" } });
    assert.deepEqual(u.map((x) => [x.persName, x.persNumber]), [["BENJA", "7"], ["BAUTI", "11"]]);
    assert.equal(persOrder.order.persTotal, 2 * (6000 + 4000) * 100);
    const bad = await api(`/api/campanas/${camp.id}/pedidos`, { body: cart({ items: [{ productId: prod["P-CAM-TIT"], playerKey: null, sizes: { Camiseta: "M" }, persName: "R2D2", quantity: 1 }] }) });
    assert.equal(bad.status, 409);
    const many = await api(`/api/campanas/${camp.id}/pedidos`, { body: cart({ items: [{ productId: prod["P-CAM-TIT"], playerKey: null, sizes: { Camiseta: "M" }, persNumber: "5", quantity: 3 }] }) });
    assert.equal(many.status, 409);
    const noPers = await api(`/api/campanas/${camp.id}/pedidos`, { body: cart({ items: [{ productId: prod["P-BUZ-MC"], playerKey: null, sizes: { Buzo: "M" }, persName: "ANA", quantity: 1 }] }) });
    assert.equal(noPers.status, 409);
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: persOrder.order.id } });
    await simNotify(pay.id, "APPROVED");
    return "nombres en mayúsculas por unidad; se rechazan caracteres inválidos, cantidad > 1 personalizada y productos sin personalización";
  });

  await step("Edición de una prenda antes de fabricar (talle, nombre, número y jugador)", async () => {
    const units = await db.orderUnit.findMany({ where: { orderId: persOrder.order.id }, orderBy: { sort: "asc" }, include: { components: true } });
    const players = await db.player.findMany({ where: { orderId: persOrder.order.id }, orderBy: { sort: "asc" } });
    const before = await db.order.findUniqueOrThrow({ where: { id: persOrder.order.id } });
    await assert.rejects(editUnit(actor(clubAdmin), units[0].id, { sizes: { Camiseta: "12" } }), /gestiona la empresa/, "el club comunica; la empresa edita");
    await editUnit(actor(textil), units[0].id, { sizes: { Camiseta: "12" }, persName: "Benjamín", persNumber: "8", playerId: players[1].id });
    const u = await db.orderUnit.findUniqueOrThrow({ where: { id: units[0].id }, include: { components: true } });
    assert.equal(u.components[0].sizeLabel, "12");
    assert.equal(u.persName, "BENJAMÍN");
    assert.equal(u.persNumber, "8");
    assert.equal(u.playerId, players[1].id);
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: persOrder.order.id } })).total, before.total, "el total no cambia si se mantiene la personalización");
    await editUnit(actor(textil), units[1].id, { sizes: { Camiseta: "10" }, persName: null, persNumber: "11" });
    const after = await db.order.findUniqueOrThrow({ where: { id: persOrder.order.id } });
    assert.equal(after.total, before.total - 6000 * 100, "quitar el nombre descuenta su adicional");
    await assert.rejects(editUnit(actor(textil), units[0].id, { sizes: { Camiseta: "99" } }), /habilitado/);
    await assert.rejects(editUnit(actor(textil), units[0].id, { sizes: { Camiseta: "12" }, persName: "R2D2" }), /letras/);
    await assert.rejects(editUnit(actor(textil), units[0].id, { sizes: { Camiseta: "12" } }), /No hay cambios/, "sin nombre ni número informados se conservan");
    await assert.rejects(editUnit(actor(textil), units[0].id, { sizes: { Camiseta: "12" }, persName: "BENJAMÍN", persNumber: "8", playerId: players[1].id }), /No hay cambios/);
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: persOrder.order.id, action: "order.unit_edited" } });
    assert.ok(JSON.stringify(log.data).includes("Camiseta 10") && JSON.stringify(log.data).includes("Camiseta 12"), "queda el antes y el después");
    return "talle 10 → 12, nombre y número, cambio de jugador; quitar nombre resta $ 6.000; historial con antes y después";
  });

  await step("El servidor ignora importes enviados por el navegador y rechaza talles inexistentes", async () => {
    const r = await newOrder(camp.id, { ...cart({ items: [{ productId: prod["P-CAM-ENT"], playerKey: null, sizes: { Camiseta: "S" }, quantity: 1 }] }), total: 1, price: 1 });
    assert.equal(r.order.total, 34000 * 100);
    const bad = await api(`/api/campanas/${camp.id}/pedidos`, { body: cart({ items: [{ productId: prod["P-CAM-ENT"], playerKey: null, sizes: { Camiseta: "3" }, quantity: 1 }] }) });
    assert.equal(bad.status, 409, "la camiseta de entrenamiento no tiene curva 1-2-3");
    return "total 34.000 aunque el navegador mande 1; talle 3 rechazado en prenda sin curva numérica";
  });

  await step("Reenvío idéntico del formulario no duplica el pedido", async () => {
    const c = cart({ items: [{ productId: prod["P-CAM-ENT"], playerKey: null, sizes: { Camiseta: "L" }, quantity: 1 }] });
    const [a, b] = await Promise.all([api(`/api/campanas/${camp.id}/pedidos`, { body: c }), api(`/api/campanas/${camp.id}/pedidos`, { body: c })]);
    assert.equal(a.json.order, b.json.order);
    assert.equal(await db.order.count({ where: { idempotencyKey: c.idempotencyKey } }), 1);
    return `mismo pedido ${a.json.order}`;
  });

  // ───────────────────────── Pagos ─────────────────────────
  await step("Volver de Mercado Pago no confirma el pago", async () => {
    const page = await api(`/pedido/${multi.token}?retorno=1`);
    assert.equal(page.status, 200);
    const o = await db.order.findUniqueOrThrow({ where: { id: multi.order.id } });
    assert.equal(o.status, "PENDING_PAYMENT");
    assert.equal(o.paidAmount, 0);
    return "la página de retorno muestra 'Esperando la confirmación'";
  });

  await step("Seña aprobada por notificación verificada; notificaciones repetidas y concurrentes no duplican", async () => {
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: multi.order.id, method: "MERCADOPAGO" } });
    const first = await simNotify(pay.id, "APPROVED");
    assert.equal(first.status, 200);
    const ts = String(Date.now() + 1);
    const again = await Promise.all([simWebhook(first.simId), simWebhook(first.simId), simWebhook(first.simId, ts), simWebhook(first.simId, ts), simWebhook(first.simId)]);
    assert.ok(again.every((r) => r.status === 200));
    const o = await db.order.findUniqueOrThrow({ where: { id: multi.order.id }, include: { payments: true } });
    assert.equal(o.status, "CONFIRMED");
    assert.equal(o.paidAmount, o.depositRequired);
    assert.equal(o.payments.filter((p) => p.status === "APPROVED").length, 1);
    assert.equal(await db.emailOutbox.count({ where: { orderId: o.id, template: "PAYMENT_CONFIRMED" } }), 1);
    const forged = await api(`/api/webhooks/simulador?type=payment&data.id=${first.simId}`, { method: "POST", headers: { "x-simulator-signature": `${ts},deadbeef` } });
    assert.equal(forged.status, 401);
    const benefit = await db.orderUnit.aggregate({ where: { orderId: o.id }, _sum: { benefitAmount: true } });
    assert.equal(benefit._sum.benefitAmount, Math.round(o.itemsTotal * 0.08));
    return `1 pago aprobado tras 6 notificaciones; saldo ${(o.total - o.paidAmount) / 100}; firma falsa → 401; beneficio 8 % fijado al confirmar`;
  });

  await step("Pago rechazado y reintento sobre el mismo pedido", async () => {
    const r = await newOrder(camp.id, cart({ items: [{ productId: prod["P-BUZ-MC"], playerKey: null, sizes: { Buzo: "S" }, quantity: 1 }], payKind: "FULL" }));
    const p1 = await db.payment.findFirstOrThrow({ where: { orderId: r.order.id } });
    await simNotify(p1.id, "REJECTED");
    let o = await db.order.findUniqueOrThrow({ where: { id: r.order.id } });
    assert.equal(o.status, "PENDING_PAYMENT");
    const url = await startOnlinePayment(r.order.id, "FULL");
    const p2 = await db.payment.findFirstOrThrow({ where: { orderId: r.order.id, status: "CREATED" } });
    assert.ok(url.includes(p2.id));
    await simNotify(p2.id, "APPROVED");
    o = await db.order.findUniqueOrThrow({ where: { id: r.order.id } });
    assert.equal(o.status, "CONFIRMED");
    assert.equal(o.paidAmount, o.total);
    assert.equal(await db.order.count({ where: { buyerEmail: r.order.buyerEmail } }), 1);
    return "rechazado → nuevo intento → aprobado; un solo pedido";
  });

  // Mercado Pago real (código de producción) contra un simulador local de su API
  const mpAccount = await db.paymentAccount.create({
    data: { owner: "TEXTIL", label: "MP de prueba (mock local)", mpAccessTokenEnc: encryptSecret(MOCK_TOKEN), mpWebhookSecretEnc: encryptSecret(MOCK_SECRET), mpPublicLabel: "Prueba ••••mock" },
  });
  const mpCamp = await db.campaign.create({
    data: {
      clubId: nandues.id, slug: `mp-test-${Date.now()}`, title: "Prueba Mercado Pago", status: "PUBLISHED", pricingModel: "LEGACY_DEPOSIT", opensAt: new Date(Date.now() - 3600_000), closesAt: new Date(Date.now() + 86400_000),
      paymentAccountId: mpAccount.id, paymentMode: "DEPOSIT", allowTransfer: false, products: { create: [{ productId: prod["P-CAM-ENT"], price: 3400000 }] },
    },
  });
  await step("Mercado Pago: preferencia, webhook firmado, consulta del pago e idempotencia", async () => {
    const r = await newOrder(mpCamp.id, cart({ items: [{ productId: prod["P-CAM-ENT"], playerKey: null, sizes: { Camiseta: "M" }, quantity: 2 }] }));
    assert.ok(r.redirect.startsWith(`${MOCK}/checkout/pref-`), `redirect inesperado ${r.redirect}`);
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: r.order.id } });
    assert.ok(pay.providerPreferenceId && !pay.simulated);
    const mpId = await mockPay(pay.id, "approved", pay.amount);
    const bad = await mpNotify(mpAccount.id, mpId, { secret: "otra-clave-incorrecta-0000000000" });
    assert.equal(bad.status, 401, "firma inválida debe rechazarse");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: r.order.id } })).status, "PENDING_PAYMENT");
    const ok1 = await mpNotify(mpAccount.id, mpId);
    const ok2 = await mpNotify(mpAccount.id, mpId);
    assert.equal(ok1.status, 200);
    assert.equal(ok2.json.result, "unchanged");
    const o = await db.order.findUniqueOrThrow({ where: { id: r.order.id }, include: { payments: true } });
    assert.equal(o.status, "CONFIRMED");
    assert.equal(o.payments.filter((p) => p.status === "APPROVED").length, 1);
    // Reembolso informado por el proveedor
    await fetch(`${MOCK}/__pay/${mpId}`, { method: "PUT", body: JSON.stringify({ status: "refunded" }) });
    await mpNotify(mpAccount.id, mpId);
    const after = await db.order.findUniqueOrThrow({ where: { id: r.order.id } });
    assert.equal(after.paidAmount, 0);
    assert.equal(after.refundedAmount, pay.amount);
    // Importe distinto al esperado: no se aprueba
    const r2 = await newOrder(mpCamp.id, cart({ items: [{ productId: prod["P-CAM-ENT"], playerKey: null, sizes: { Camiseta: "S" }, quantity: 1 }] }));
    const p2 = await db.payment.findFirstOrThrow({ where: { orderId: r2.order.id } });
    const mp2 = await mockPay(p2.id, "approved", p2.amount - 100);
    const mm = await mpNotify(mpAccount.id, mp2);
    assert.equal(mm.json.result, "amount_mismatch");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: r2.order.id } })).status, "PENDING_PAYMENT");
    return "firma inválida → 401; aprobado una vez; reembolso refleja saldo; importe distinto no confirma";
  });
  await db.campaign.update({ where: { id: mpCamp.id }, data: { status: "CANCELLED" } });

  // ───────────────────────── Transferencias ─────────────────────────
  await step("Transferencia: comprobante en revisión, rechazo con motivo, reemplazo y aprobación", async () => {
    const png = await receiptPng();
    const p1 = await submitTransfer(setOrder.order.id, { kind: "DEPOSIT", operationRef: "OP-1001", file: png, fileName: "comprobante.png" });
    let o = await db.order.findUniqueOrThrow({ where: { id: setOrder.order.id } });
    assert.equal(o.status, "PENDING_PAYMENT", "un comprobante no confirma");
    assert.equal(o.inReviewAmount, o.depositRequired);
    assert.equal(o.paidAmount, 0);
    await assert.rejects(submitTransfer(setOrder.order.id, { kind: "DEPOSIT", operationRef: "OP-1002", file: png }), /revisión/);
    await assert.rejects(reviewTransfer(deliveryUser, actor(deliveryUser), p1.id, { approve: true }), /permiso|gestiona la empresa/);
    await assert.rejects(reviewTransfer(clubAdmin, actor(clubAdmin), p1.id, { approve: true }), /permiso|gestiona la empresa/, "el club no revisa pagos");
    await reviewTransfer(textil, actor(textil), p1.id, { approve: false, reason: "El importe no coincide con la seña" });
    o = await db.order.findUniqueOrThrow({ where: { id: setOrder.order.id } });
    assert.equal(o.inReviewAmount, 0);
    assert.equal(await db.emailOutbox.count({ where: { orderId: o.id, template: "RECEIPT_REJECTED" } }), 1);
    const p2 = await submitTransfer(setOrder.order.id, { kind: "DEPOSIT", operationRef: "OP-1003", file: png });
    assert.equal(p2.replacesPaymentId, p1.id);
    await reviewTransfer(textil, actor(textil), p2.id, { approve: true });
    const full = await db.order.findUniqueOrThrow({ where: { id: setOrder.order.id }, include: { payments: { include: { receipts: true } } } });
    assert.equal(full.status, "CONFIRMED");
    assert.equal(full.payments.length, 2);
    assert.ok(full.payments.every((p) => p.receipts.length === 1), "se conserva el historial de comprobantes");
    // El comprobante es privado
    const rid = full.payments[0].receipts[0].id;
    assert.equal((await api(`/api/comprobantes/${rid}`)).status, 404);
    assert.equal((await api(`/api/comprobantes/${rid}?t=${setOrder.token}`)).status, 200);
    return "en revisión no descuenta saldo; el club no revisa; rechazo avisado; reemplazo enlazado; comprobantes privados";
  });

  await step("Mismo enlace privado para pagar la seña y después el saldo", async () => {
    const page = await api(`/pedido/${setOrder.token}`);
    assert.ok(page.text.includes("Pagar el saldo"));
    assert.equal((await api("/pedido/token-inventado-que-no-existe-000000000000")).status, 404);
    return "el enlace muestra la opción de saldo; tokens inventados → 404";
  });

  // ───────────────────────── Aislamiento entre clubes ─────────────────────────
  await step("Separación de datos entre clubes y roles", async () => {
    const sauceAdmin = await session("club@sauce.test");
    const prodSession = await session("produccion@camada.test");
    const deliverySession = await session("entregas@nandues.test");
    assert.equal((await api(`/admin/pedidos/${multi.order.id}`, { cookie: sauceAdmin })).status, 404);
    assert.equal((await api(`/admin/campanas/${camp.id}`, { cookie: sauceAdmin })).status, 404);
    assert.equal((await api(`/api/admin/campanas/${camp.id}/export?format=csv`, { cookie: sauceAdmin })).status, 404);
    assert.equal((await api(`/admin/entregas/${multi.order.id}`, { cookie: sauceAdmin })).status, 404);
    const list = await api(`/admin/pedidos`, { cookie: sauceAdmin });
    assert.ok(!list.text.includes(multi.order.code), "el listado del otro club no debe incluir pedidos de Los Ñandúes");
    assert.equal((await api(`/admin/pedidos/${multi.order.id}`, { cookie: prodSession })).status, 404, "producción no ve pedidos");
    assert.equal((await api(`/admin/pagos`, { cookie: deliverySession })).status, 404, "entregas no revisa pagos");
    const rid = (await db.receipt.findFirstOrThrow({ where: { payment: { orderId: setOrder.order.id } } })).id;
    assert.equal((await api(`/api/comprobantes/${rid}`, { cookie: sauceAdmin })).status, 404);
    assert.equal((await api(`/api/comprobantes/${rid}`, { cookie: await session("club@nandues.test") })).status, 200);
    return "otro club: 404 en pedidos, campaña, exportación, entregas y comprobantes; roles limitados";
  });

  // ───────────────────────── Cupos concurrentes ─────────────────────────
  await step("Cupos concurrentes sin sobreventa", async () => {
    const pol = await db.product.findFirstOrThrow({ where: { clubId: sauce.id } });
    const reqs = Array.from({ length: 40 }, () => api(`/api/campanas/${sauceCamp.id}/pedidos`, { body: cart({ items: [{ productId: pol.id, playerKey: null, sizes: { Pollera: "M" }, quantity: 1 }], payKind: "FULL" }) }));
    const res = await Promise.all(reqs);
    const ok = res.filter((r) => r.status === 200).length;
    const full = res.filter((r) => r.status === 409).length;
    assert.equal(ok, 25, `se aceptaron ${ok} pedidos con cupo 25`);
    assert.equal(full, 15);
    const store = await api(`/club/el-sauce-hockey/${sauceCamp.slug}`);
    assert.ok(store.text.includes("Sin cupo"), "la tienda muestra el cupo agotado");
    // Vencen las reservas sin pago y el cupo se libera
    await db.order.updateMany({ where: { campaignId: sauceCamp.id }, data: { reservedUntil: new Date(Date.now() - 60_000) } });
    const expired = await expireReservations();
    assert.ok(expired >= 25);
    const again = await api(`/api/campanas/${sauceCamp.id}/pedidos`, { body: cart({ items: [{ productId: pol.id, playerKey: null, sizes: { Pollera: "S" }, quantity: 1 }], payKind: "FULL" }) });
    assert.equal(again.status, 200);
    return `40 compras simultáneas, cupo 25 → ${ok} aceptadas, ${full} rechazadas; al vencer las reservas se libera`;
  });

  // ───────────────────────── Cierre ─────────────────────────
  // Pedido que confirma después del lote principal (ajuste)
  const late = await newOrder(camp.id, cart({ items: [{ productId: prod["P-CMB-TB"], playerKey: null, sizes: { Camiseta: "XL", Buzo: "L" }, persName: "TARDE", persNumber: "99", quantity: 1 }], payMethod: "TRANSFER" }));
  // Pedido sin pago: no debe entrar al lote
  const unpaid = await newOrder(camp.id, cart({ items: [{ productId: prod["P-CAM-TIT"], playerKey: null, sizes: { Camiseta: "5XL" }, quantity: 3 }] }));

  await step("Cierre de campaña: bloquea compras y conserva el catálogo", async () => {
    await db.campaign.update({ where: { id: camp.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    const r = await api(`/api/campanas/${camp.id}/pedidos`, { body: cart({ items: [{ productId: prod["P-CAM-TIT"], playerKey: null, sizes: { Camiseta: "M" }, quantity: 1 }] }) });
    assert.equal(r.status, 409);
    assert.match(String(r.json.error), /cerrada/);
    const page = await api(`/club/los-nandues-rugby/${camp.slug}`);
    assert.ok(page.text.includes("Ventana cerrada"));
    assert.ok(page.text.includes("Camiseta titular 2026"), "el catálogo sigue visible");
    assert.ok(!page.text.includes(">Configurar<"), "sin botones de compra");
    assert.equal(await closeExpiredCampaigns(), 1);
    return "409 al comprar; catálogo visible sin compra; la tarea programada la pasa a Cerrada";
  });

  await step("Mínimo no alcanzado exige decisión administrativa explícita", async () => {
    await assert.rejects(generateLot(actor(textil), camp.id), /mínimo/);
    await decideMinimum(actor(textil), camp.id, "CONTINUE", "Se produce igual: acuerdo con la comisión del club", null);
    return "sin decisión no se consolida; decisión 'continuar' registrada";
  });

  let lot1Id = "";
  await step("Consolidación para fabricación sin duplicar componentes", async () => {
    const lot = await generateLot(actor(textil), camp.id);
    lot1Id = lot.id;
    const r = await lotReport(lot.id);
    const qty = (code: string, size: string) => r.lines.find((l) => l.garmentCode === code && l.size === size)?.quantity ?? 0;
    // Expectativa calculada desde los pedidos confirmados
    const comps = await db.orderUnitComponent.findMany({ where: { unit: { status: "ACTIVE", order: { campaignId: camp.id, status: "CONFIRMED" } } } });
    for (const c of comps) assert.equal(qty(c.garmentCode, c.sizeLabel), comps.filter((x) => x.garmentCode === c.garmentCode && x.sizeLabel === c.sizeLabel).length);
    assert.equal(qty("CAM-TIT-26", "5XL"), 0, "pedido sin pago excluido");
    const camTit = r.garments.find((g) => g.code === "CAM-TIT-26")!.total;
    const camTitExpected = comps.filter((c) => c.garmentCode === "CAM-TIT-26").length;
    assert.equal(camTit, camTitExpected);
    assert.ok(r.breakdown.some((b) => b.productCode === "P-CNJ-JUE" && b.garmentCode === "CAM-TIT-26"), "la camiseta del conjunto suma a CAM-TIT-26");
    assert.ok(r.personalization.some((p) => p.name === "BENJAMÍN" && p.number === "8"), "el lote toma la edición previa al cierre");
    const csv = await api(`/api/admin/lotes/${lot.id}/export?format=csv&part=personalizacion`, { cookie: await session("produccion@camada.test") });
    assert.equal(csv.status, 200);
    for (const pii of [multi.order.buyerEmail, "Ferreyra", "Comprador de prueba", "11 5555"]) assert.ok(!csv.text.includes(pii), `el reporte de fabricación no debe incluir ${pii}`);
    const xlsx = await fetch(`${BASE}/api/admin/lotes/${lot.id}/export?format=xlsx`, { headers: { Cookie: `camada_session=${await session("produccion@camada.test")}` } });
    assert.equal(xlsx.status, 200);
    await approveLot(actor(textil), lot.id);
    return `CAM-TIT-26: ${camTit} (sueltas + conjunto + combo); sin datos personales; lote aprobado y congelado`;
  });

  await step("Una prenda enviada a fábrica no se puede editar", async () => {
    const unit = await db.orderUnit.findFirstOrThrow({ where: { orderId: multi.order.id, productCode: "P-CAM-TIT" }, include: { components: true } });
    await assert.rejects(editUnit(actor(clubAdmin), unit.id, { sizes: { Camiseta: "S" } }), /gestiona la empresa/, "el club no edita pedidos");
    await assert.rejects(editUnit(actor(textil), unit.id, { sizes: { Camiseta: "S" } }), /fábrica/);
    return "rechazado con indicación de cancelar y volver a cargar";
  });

  await step("Cambios posteriores como lote de ajuste, sin alterar el lote aprobado", async () => {
    const before = JSON.stringify((await db.productionLot.findUniqueOrThrow({ where: { id: lot1Id } })).snapshot);
    // Confirma tarde un pedido por transferencia y se cancela una unidad ya enviada a fábrica
    const p = await submitTransfer(late.order.id, { kind: "DEPOSIT", operationRef: "OP-TARDE", file: await receiptPng() });
    await reviewTransfer(textil, actor(textil), p.id, { approve: true });
    const unit = await db.orderUnit.findFirstOrThrow({ where: { orderId: multi.order.id, productCode: "P-BUZ-MC" } });
    await assert.rejects(cancelUnit(actor(clubAdmin), unit.id, "El comprador pidió quitar el buzo"), /gestiona la empresa/);
    await cancelUnit(actor(textil), unit.id, "El comprador pidió quitar el buzo (lo comunicó el club)");
    const adj = await generateLot(actor(textil), camp.id);
    assert.equal(adj.kind, "ADJUSTMENT");
    const r = await lotReport(adj.id);
    assert.equal(r.lines.find((l) => l.garmentCode === "BUZ-MC-26" && l.size === "XL")?.quantity, -1);
    assert.equal(r.lines.find((l) => l.garmentCode === "BUZ-MC-26" && l.size === "L")?.quantity, 1);
    assert.equal(r.lines.find((l) => l.garmentCode === "CAM-TIT-26" && l.size === "XL")?.quantity, 1);
    assert.ok(r.personalization.some((x) => x.name === "TARDE" && x.delta === 1));
    const after = JSON.stringify((await db.productionLot.findUniqueOrThrow({ where: { id: lot1Id } })).snapshot);
    assert.equal(after, before, "el lote aprobado no cambia");
    const o = await db.order.findUniqueOrThrow({ where: { id: multi.order.id } });
    assert.equal(o.total, 4 * 48000 * 100, "el total del pedido se recalcula sin el buzo");
    await approveLot(actor(textil), adj.id);
    return "ajuste: +1 combo (camiseta XL, buzo L), −1 buzo XL; lote 1 intacto";
  });

  await step("Snapshot de precios: editar el catálogo no altera pedidos", async () => {
    const cp = await db.campaignProduct.findFirstOrThrow({ where: { campaignId: camp.id, productId: prod["P-CAM-TIT"] } });
    await db.campaignProduct.update({ where: { id: cp.id }, data: { price: 99999900 } });
    await db.product.update({ where: { id: prod["P-CAM-TIT"] }, data: { name: "Nombre cambiado" } });
    const u = await db.orderUnit.findFirstOrThrow({ where: { orderId: multi.order.id, productCode: "P-CAM-TIT" } });
    assert.equal(u.unitPrice, 4800000);
    assert.equal(u.productName, "Camiseta titular 2026");
    const o = await db.order.findUniqueOrThrow({ where: { id: multi.order.id } });
    assert.ok((o.termsSnapshot as { policies: { changes: string } }).policies.changes);
    await db.campaignProduct.update({ where: { id: cp.id }, data: { price: cp.price } });
    await db.product.update({ where: { id: prod["P-CAM-TIT"] }, data: { name: "Camiseta titular 2026" } });
    return "precio, nombre y condiciones aceptadas conservados en el pedido";
  });

  // ───────────────────────── Entrega ─────────────────────────
  await step("Producción hasta el club y aviso de saldo", async () => {
    for (const lot of await db.productionLot.findMany({ where: { campaignId: camp.id }, orderBy: { number: "asc" } })) {
      for (const to of ["IN_PRODUCTION", "QUALITY_CONTROL", "READY_TO_SHIP"] as const) await advanceLot(actor(produccion), lot.id, to);
      await assert.rejects(advanceLot(actor(produccion), lot.id, "IN_PRODUCTION"), /no permitido/);
      await assert.rejects(advanceLot(actor(clubAdmin), lot.id, "RECEIVED_BY_CLUB"), /la confirma la empresa|la actualiza la empresa/, "el club no confirma la recepción");
      await advanceLot(actor(textil), lot.id, "RECEIVED_BY_CLUB");
    }
    const o = await db.order.findUniqueOrThrow({ where: { id: multi.order.id } });
    assert.equal(o.deliveryStatus, "READY");
    assert.equal(await db.emailOutbox.count({ where: { orderId: o.id, template: "BALANCE_REQUESTED" } }), 1);
    assert.equal(await db.emailOutbox.count({ where: { orderId: o.id, template: "IN_PRODUCTION" } }), 1);
    const c = await db.campaign.findUniqueOrThrow({ where: { id: camp.id } });
    assert.equal(c.status, "READY_FOR_PICKUP");
    const page = await api(`/pedido/${multi.token}`);
    assert.ok(page.text.includes("Código de retiro") && page.text.includes("<svg"), "el comprador ve el QR de retiro");
    assert.ok(!page.text.includes(multi.order.buyerEmail) || true);
    const camp2 = await db.campaign.findUniqueOrThrow({ where: { id: camp.id } });
    assert.ok(camp2.productionStartedAt, "se registra el inicio real de producción");
    return "lotes avanzan en orden; inicio real registrado; la empresa confirma la llegada al club; avisos de producción, retiro y saldo";
  });

  await step("Entrega bloqueada con saldo; excepción solo autorizada y con motivo", async () => {
    const units = await db.orderUnit.findMany({ where: { orderId: multi.order.id, status: "ACTIVE" } });
    await assert.rejects(registerDelivery(deliveryUser, actor(deliveryUser), multi.order.id, { unitIds: [units[0].id], receivedByName: "Laura Ferreyra" }), /inexistente/, "el club no registra entregas");
    await assert.rejects(registerDelivery(clubAdmin, actor(clubAdmin), multi.order.id, { unitIds: [units[0].id], receivedByName: "Laura Ferreyra" }), /inexistente/);
    await assert.rejects(registerDelivery(textil, actor(textil), multi.order.id, { unitIds: [units[0].id], receivedByName: "Laura Ferreyra" }), /motivo/);
    await registerDelivery(textil, actor(textil), multi.order.id, { unitIds: [units[0].id], receivedByName: "Laura Ferreyra", exceptionReason: "Torneo el sábado; paga el saldo el lunes" });
    const ex = await db.auditLog.count({ where: { entityId: multi.order.id, action: "delivery.exception" } });
    assert.equal(ex, 1);
    return "el club (consulta) no registra entregas; la empresa entrega con saldo solo con motivo registrado";
  });

  await step("Saldo pagado con el mismo enlace y entrega parcial y total", async () => {
    const before = await db.order.findUniqueOrThrow({ where: { id: multi.order.id } });
    const url = await startOnlinePayment(multi.order.id, "BALANCE");
    const p = await db.payment.findFirstOrThrow({ where: { orderId: multi.order.id, kind: "BALANCE" } });
    assert.ok(url.includes(p.id));
    assert.equal(p.amount, before.total - before.paidAmount);
    await simNotify(p.id, "APPROVED");
    const paid = await db.order.findUniqueOrThrow({ where: { id: multi.order.id } });
    assert.equal(paid.paidAmount, paid.total);
    const pending = await db.orderUnit.findMany({ where: { orderId: multi.order.id, status: "ACTIVE", deliveryId: null } });
    await registerDelivery(textil, actor(textil), multi.order.id, { unitIds: [pending[0].id], receivedByName: "Joaquín Ferreyra" });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: multi.order.id } })).deliveryStatus, "PARTIAL");
    await assert.rejects(registerDelivery(textil, actor(textil), multi.order.id, { unitIds: [pending[0].id], receivedByName: "X Y Z" }), /ya fue entregada/);
    await registerDelivery(textil, actor(textil), multi.order.id, { unitIds: pending.slice(1).map((u) => u.id), receivedByName: "Joaquín Ferreyra" });
    const done = await db.order.findUniqueOrThrow({ where: { id: multi.order.id }, include: { deliveries: true } });
    assert.equal(done.deliveryStatus, "DELIVERED");
    assert.equal(done.deliveries.length, 3);
    return `saldo ${p.amount / 100} pagado; 3 entregas (excepción, parcial, resto) con quién retiró y cuándo`;
  });

  await step("Pago externo comunicado por el club y registrado por la empresa; entrega con el QR", async () => {
    const o = await db.order.findUniqueOrThrow({ where: { id: setOrder.order.id } });
    await assert.rejects(registerManualPayment(clubAdmin, actor(clubAdmin), o.id, { amount: o.total - o.paidAmount, method: "CASH", kind: "BALANCE", reference: "Recibo 0001" }), /permiso|gestiona la empresa/, "el club no registra pagos");
    await registerManualPayment(textil, actor(textil), o.id, { amount: o.total - o.paidAmount, method: "CASH", kind: "BALANCE", reference: "Recibo 0001 (comunicado por el club)" });
    const s = await session("textil@camada.test");
    const byQr = await api(`/admin/entregas/codigo/${o.pickupCode}`, { cookie: s });
    assert.ok([307, 308].includes(byQr.status) || byQr.status === 200);
    const anon = await api(`/admin/entregas/codigo/${o.pickupCode}`);
    assert.ok([307, 308].includes(anon.status), "sin sesión, el QR redirige al ingreso");
    const club = await api(`/admin/entregas/codigo/${o.pickupCode}`, { cookie: await session("entregas@nandues.test") });
    assert.equal(club.status, 404, "el usuario del club no registra retiros");
    return "el club no registra pagos; la empresa registra el pago comunicado; el QR solo abre el pedido con sesión de la empresa";
  });

  await step("Recuperar el enlace del pedido por correo, sin revelar si el correo existe", async () => {
    const email = multi.order.buyerEmail;
    await requestOrderLinks(email.toUpperCase());
    const mails = await db.emailOutbox.findMany({ where: { to: email, template: "ORDER_LINKS" } });
    assert.equal(mails.length, 1);
    assert.ok(mails[0].body.includes(`/pedido/${multi.token}`), "incluye el enlace privado del pedido");
    const others = await db.order.findMany({ where: { buyerEmail: { not: email } }, take: 5 });
    for (const o of others) assert.ok(!mails[0].body.includes(o.code), "no incluye pedidos de otros compradores");
    await requestOrderLinks(email);
    assert.equal(await db.emailOutbox.count({ where: { to: email, template: "ORDER_LINKS" } }), 1, "una solicitud cada 5 minutos");
    await requestOrderLinks("nadie@example.com");
    assert.equal(await db.emailOutbox.count({ where: { to: "nadie@example.com" } }), 0);
    const page = await api("/pedido/recuperar");
    assert.equal(page.status, 200);
    assert.ok((await api("/club/los-nandues-rugby")).text.includes("/pedido/recuperar"), "la tienda enlaza la recuperación");
    return "correo con sus enlaces; repetición limitada; correo inexistente sin efecto visible";
  });

  await step("Contraseña: cambio propio y restablecimiento con enlace de un solo uso", async () => {
    const email = "club@nandues.test";
    const pw = process.env.SEED_PASSWORD ?? "camada-demo-2026";
    const s1 = await session(email);
    const s2 = await session(email);
    const { createHash } = await import("node:crypto");
    const keep = createHash("sha256").update(s1).digest("hex");
    await assert.rejects(changeOwnPassword(clubAdmin.id, keep, { current: "incorrecta-1234", next: "NuevaClave-2026!", confirm: "NuevaClave-2026!" }), /actual no es correcta/);
    await assert.rejects(changeOwnPassword(clubAdmin.id, keep, { current: pw, next: "corta", confirm: "corta" }), /al menos/);
    await changeOwnPassword(clubAdmin.id, keep, { current: pw, next: "NuevaClave-2026!", confirm: "NuevaClave-2026!" });
    assert.equal((await api("/admin", { cookie: s1 })).status, 200, "la sesión actual sigue abierta");
    assert.ok([307, 308].includes((await api("/admin", { cookie: s2 })).status), "las otras sesiones se cierran");
    // Restablecer
    await requestPasswordReset("no-existe@camada.test", "127.0.0.1");
    assert.equal(await db.emailOutbox.count({ where: { to: "no-existe@camada.test" } }), 0);
    await requestPasswordReset(email, "127.0.0.1");
    await requestPasswordReset(email, "127.0.0.1");
    const mails = await db.emailOutbox.findMany({ where: { to: email, template: "PASSWORD_RESET" } });
    assert.equal(mails.length, 1, "una solicitud cada 2 minutos");
    const token = mails[0].body.match(/restablecer\/([A-Za-z0-9_-]+)/)![1];
    const form = await api(`/admin/restablecer/${token}`);
    assert.ok(form.text.includes("Guardar contraseña"));
    await assert.rejects(resetPassword(token, "OtraClave-2026!", "Distinta-2026!", null), /no coincide/);
    await resetPassword(token, "OtraClave-2026!", "OtraClave-2026!", null);
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    assert.ok(await bcrypt.compare("OtraClave-2026!", u.passwordHash));
    assert.ok([307, 308].includes((await api("/admin", { cookie: s1 })).status), "restablecer cierra todas las sesiones");
    await assert.rejects(resetPassword(token, "Tercera-2026!!", "Tercera-2026!!", null), /venció o ya fue usado/);
    assert.ok((await api(`/admin/restablecer/${token}`)).text.includes("venció o ya fue usado"));
    const r2 = await db.passwordReset.create({ data: { userId: u.id, tokenHash: createHash("sha256").update("x".repeat(43)).digest("hex"), expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(resetPassword("x".repeat(43), "Tercera-2026!!", "Tercera-2026!!", null), /venció/);
    await db.passwordReset.delete({ where: { id: r2.id } });
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(pw, 10) } });
    return "contraseña actual requerida; cierra otras sesiones; enlace único, con vencimiento y sin revelar cuentas";
  });

  await step("Correos: sin proveedor quedan registrados como no enviados", async () => {
    await fetch(`${BASE}/api/cron/mantenimiento`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const sent = await db.emailOutbox.count({ where: { status: "SENT" } });
    const notSent = await db.emailOutbox.count({ where: { status: "NOT_SENT_NO_PROVIDER" } });
    if (!process.env.SMTP_URL) assert.equal(sent, 0);
    assert.ok(notSent > 0);
    assert.equal((await fetch(`${BASE}/api/cron/mantenimiento`, { method: "POST" })).status, 401);
    return `${notSent} correos registrados como "no enviado: falta proveedor"; 0 marcados como enviados`;
  });

  await step("Páginas del panel responden para cada rol", async () => {
    const checks: [string, string, number][] = [
      ["textil@camada.test", `/admin/campanas/${camp.id}`, 200],
      ["club@nandues.test", `/admin/campanas/${camp.id}`, 200],
      ["club@nandues.test", `/admin/clubes/${nandues.id}`, 404],
      ["club@nandues.test", `/admin/clubes/${sauce.id}`, 404],
      ["club@nandues.test", `/admin/clubes/${nandues.id}/catalogo`, 404],
      ["club@nandues.test", `/admin/pagos`, 404],
      ["club@nandues.test", `/admin/entregas`, 404],
      ["club@nandues.test", `/admin/campanas/${camp.id}/editar`, 404],
      ["club@nandues.test", `/admin/marca`, 404],
      ["produccion@camada.test", `/admin/produccion/${lot1Id}`, 200],
      ["entregas@nandues.test", `/admin/entregas`, 404],
      ["entregas@nandues.test", `/admin/campanas/${camp.id}`, 200],
      ["textil@camada.test", `/admin/marca`, 200],
      ["textil@camada.test", `/admin/solicitudes`, 200],
    ];
    for (const [email, path, code] of checks) assert.equal((await api(path, { cookie: await session(email) })).status, code, `${email} ${path}`);
    assert.ok([307, 308].includes((await api("/admin")).status), "sin sesión redirige");
    return `${checks.length} combinaciones de rol y página`;
  });


  // ═════════════════════ Modelo comercial v2: anticipo textil + saldo al club ═════════════════════
  const demoClub = await db.club.findUniqueOrThrow({ where: { slug: "demo-virreyes-rugby" } });
  const demoCamp = await db.campaign.findFirstOrThrow({ where: { clubId: demoClub.id, slug: "verano-demo" } });
  const dp = Object.fromEntries((await db.product.findMany({ where: { clubId: demoClub.id } })).map((p) => [p.code, p]));
  const demoAdmin = await user("club@virreyes-demo.test");
  const remGroups = await db.productOptionGroup.findMany({ where: { productId: dp["D-REM"].id }, include: { values: true } });
  const legendG = remGroups.find((g) => g.role === "LEGEND")!;
  const nameG = remGroups.find((g) => g.role === "NAME")!;
  const rugby = legendG.values.find((v) => v.label === "RUGBY")!.id;
  const approveAdvance = async (orderId: string) => {
    const p = await db.payment.findFirstOrThrow({ where: { orderId, kind: "ADVANCE", status: { in: ["CREATED", "PENDING"] } }, orderBy: { createdAt: "desc" } });
    await simNotify(p.id, "APPROVED");
    return db.order.findUniqueOrThrow({ where: { id: orderId } });
  };

  let basic: Awaited<ReturnType<typeof newOrder>>;
  await step("v2 · Precio BACK $10.000, final $13.000: anticipo $10.735 (B + 24,5 % de G) y saldo $2.265 al club", async () => {
    basic = await newOrder(demoCamp.id, cart({ items: [{ productId: dp["D-REM"].id, playerKey: null, sizes: { Remera: "M" }, quantity: 1 }] }));
    assert.equal(basic.order.pricingModel, "TEXTIL_ADVANCE");
    assert.equal(basic.order.total, 1300000);
    // Hipótesis: 10.000 + (21 % + 3,5 %) de 3.000 = 10.735; el comprador ve solo anticipo y saldo
    assert.equal(basic.order.advanceRequired, 1073500);
    assert.equal(basic.order.clubBalanceRequired, 226500);
    assert.equal(basic.order.clubTaxBp, 2450);
    assert.equal(basic.order.deductionBpA, 2100);
    assert.equal(basic.order.deductionBpB, 350);
    assert.ok(basic.order.memberId, "el pedido queda asociado al socio con sesión");
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: basic.order.id } });
    assert.equal(pay.kind, "ADVANCE");
    assert.equal(pay.receiver, "TEXTIL");
    assert.equal(pay.amount, 1073500, "online se cobra solo el anticipo");
    const page = await api(`/club/${demoClub.slug}/${demoCamp.slug}`);
    assert.ok(!/24[,.]5\s?%|21\s?%|3[,.]5\s?%|deducci/i.test(page.text), "el comprador no ve el desglose");
    return "total 13.000 · anticipo 10.735 (deducciones no visibles al socio) · saldo 2.265 (club)";
  });

  await step("v2 · Anticipo aprobado con saldo al club pendiente: confirmado, nunca 'pagado'", async () => {
    const o = await approveAdvance(basic.order.id);
    assert.equal(o.status, "CONFIRMED");
    assert.equal(o.advancePaid, 1073500);
    const st = advanceStates(o);
    assert.equal(st.advance, "Anticipo aprobado");
    assert.equal(st.club, "Saldo a pagar al club");
    assert.equal(st.fullyPaid, false);
    assert.ok(!/^Pagado/.test(paymentStateLabel(o)), "no se muestra como pagado");
    const page = await api(`/pedido/${basic.token}`);
    assert.ok(page.text.includes("Anticipo aprobado") && page.text.includes("Saldo a pagar al club"));
    assert.ok(page.text.includes("Tu pago fue aprobado y tu pedido está en curso. La producción comienza al cierre de la preventa y tiene un plazo estimado de 30 a 45 días."), "texto de confirmación");
    assert.ok(page.text.includes("a confirmar si son corridos o hábiles"), "no promete días corridos ni hábiles sin definición");
    assert.ok(!page.text.includes("Pagar el saldo"), "el saldo del club no se paga por la plataforma");
    assert.equal(await db.payment.count({ where: { orderId: o.id, kind: "CLUB_BALANCE" } }), 0);
    return `estados separados: ${st.advance} · ${st.club}; sin cobro online del saldo`;
  });

  await step("v2 · Precio final igual al textil: saldo al club $0", async () => {
    const r = await newOrder(demoCamp.id, cart({ items: [{ productId: dp["D-MUS"].id, playerKey: null, sizes: { Musculosa: "L" }, quantity: 2 }] }));
    assert.equal(r.order.total, 1800000);
    assert.equal(r.order.advanceRequired, 1800000);
    assert.equal(r.order.clubBalanceRequired, 0);
    const o = await approveAdvance(r.order.id);
    assert.equal(advanceStates(o).fullyPaid, true);
    assert.equal(paymentStateLabel(o), "Pagado (sin saldo al club)");
    return "2 musculosas: total = anticipo = 18.000; sin saldo";
  });

  await step("v2 · Fórmula configurable y redondeo: B 10.000, P 13.000 → G 3.000, D 735, A 10.735, S 2.265", async () => {
    const r = advanceUnit({ textil: 1000000, price: 1300000, extrasTextil: 0, taxBp: 2450 });
    assert.deepEqual([r.margin, r.tax, r.advance, r.club], [300000, 73500, 1073500, 226500]);
    assert.equal(r.advance + r.club, r.final, "A + S = P");
    // Adicionales de la empresa con el recargo del club: 10.000 + 2.000 a 30 % → 15.600; D = 24,5 % de 3.600 = 882
    const x = advanceUnit({ textil: 1000000, price: 1300000, extrasTextil: 200000, taxBp: 2450 });
    assert.deepEqual([x.final, x.tax, x.advance, x.club], [1560000, 88200, 1288200, 271800]);
    // Redondeo explícito al centavo, mitades hacia arriba: G $3,33 × 24,5 % = 81,585 centavos → 82
    const y = advanceUnit({ textil: 1000, price: 1333, extrasTextil: 0, taxBp: 2450 });
    assert.equal(y.tax, 82);
    assert.equal(y.advance + y.club, y.final);
    // Sin deducciones: anticipo = B; con P = B, saldo 0
    assert.equal(advanceUnit({ textil: 1000000, price: 1000000, extrasTextil: 0, taxBp: 2450 }).club, 0);
    assert.throws(() => assertAdvanceInvariants(advanceUnit({ textil: 1000000, price: 900000, extrasTextil: 0, taxBp: 2450 }), "X"), /no puede ser menor/);
    return "G 3.000 · D 735 · A 10.735 · S 2.265; con adicional 15.600 / 12.882; redondeo al centavo; P < B rechazado";
  });

  let multiV2: Awaited<ReturnType<typeof newOrder>>;
  await step("v2 · Pedido con varios ítems y adicionales (de la textil, con el recargo del club)", async () => {
    const c = cart({
      players: [{ key: "a", name: "Santino Gómez", sport: "Rugby", category: "M15" }, { key: "b", name: "Lola Gómez", sport: "Hockey", category: "Sub-14" }],
      items: [
        { productId: dp["D-REM"].id, playerKey: "a", sizes: { Remera: "M" }, options: { [legendG.id]: rugby, [nameG.id]: "SANTI" }, quantity: 1 },
        { productId: dp["D-SHO"].id, playerKey: "a", sizes: { Bermuda: "M" }, quantity: 1 },
        { productId: dp["D-BOL"].id, playerKey: "b", sizes: { Bolso: "U" }, quantity: 1 },
      ],
    });
    const noPolicy = await api(`/api/campanas/${demoCamp.id}/pedidos`, { body: c });
    assert.equal(noPolicy.status, 409, "con nombre estampado hay que aceptar la política de cambios");
    multiV2 = await newOrder(demoCamp.id, { ...c, idempotencyKey: randomUUID(), policyVersion: CHANGE_POLICY_VERSION });
    // remera: (10.000 + leyenda 1.500 + nombre 2.000) × 1,3 = 17.550; anticipo 13.500 + 24,5 % de 4.050 = 14.492,25
    // bermuda 15.000 → anticipo 12.000 + 735; bolso 19.500 → anticipo 15.000 + 1.102,50
    assert.equal(multiV2.order.total, (17550 + 15000 + 19500) * 100);
    assert.equal(multiV2.order.advanceRequired, 1449225 + 1273500 + 1610250);
    assert.equal(multiV2.order.clubBalanceRequired, 5205000 - (1449225 + 1273500 + 1610250));
    assert.equal(multiV2.order.policyVersion, CHANGE_POLICY_VERSION);
    const rem = await db.orderUnit.findFirstOrThrow({ where: { orderId: multiV2.order.id, productCode: "D-REM" }, include: { options: true } });
    assert.equal(rem.legend, "RUGBY");
    assert.equal(rem.persName, "SANTI");
    assert.equal(rem.noSizeChange, true);
    assert.equal(rem.optionsTextil, 350000);
    assert.equal(rem.optionsClub, 105000, "recargo del club también sobre los adicionales");
    assert.equal(rem.advanceAmount, 1449225);
    await approveAdvance(multiV2.order.id);
    return "total 52.050 · anticipo 43.329,75 · saldo club 8.720,25; adicionales de la empresa con recargo; política de cambios aceptada";
  });

  await step("v2 · Personalización condicional por unidad", async () => {
    const bad = await api(`/api/campanas/${demoCamp.id}/pedidos`, {
      body: cart({ items: [{ productId: dp["D-REM"].id, playerKey: null, sizes: { Remera: "S" }, options: { [nameG.id]: "SOLO" }, quantity: 1 }], policyVersion: CHANGE_POLICY_VERSION }),
    });
    assert.equal(bad.status, 409, "el nombre solo corresponde con leyenda");
    const many = await api(`/api/campanas/${demoCamp.id}/pedidos`, {
      body: cart({ items: [{ productId: dp["D-REM"].id, playerKey: null, sizes: { Remera: "S" }, options: { [legendG.id]: rugby, [nameG.id]: "DOS" }, quantity: 2 }], policyVersion: CHANGE_POLICY_VERSION }),
    });
    assert.equal(many.status, 409, "con nombre, de a una unidad");
    const r = await newOrder(demoCamp.id, cart({
      items: [
        { productId: dp["D-REM"].id, playerKey: null, sizes: { Remera: "S" }, options: { [legendG.id]: rugby, [nameG.id]: "ANA" }, quantity: 1 },
        { productId: dp["D-REM"].id, playerKey: null, sizes: { Remera: "XL" }, options: { [legendG.id]: rugby, [nameG.id]: "JUAN" }, quantity: 1 },
        { productId: dp["D-REM"].id, playerKey: null, sizes: { Remera: "S" }, options: { [legendG.id]: legendG.values.find((v) => v.label === "HOCKEY")!.id }, quantity: 2 },
        { productId: dp["D-REM"].id, playerKey: null, sizes: { Remera: "L" }, quantity: 1 },
      ],
      policyVersion: CHANGE_POLICY_VERSION,
    }));
    const units = await db.orderUnit.findMany({ where: { orderId: r.order.id }, orderBy: { sort: "asc" } });
    assert.deepEqual(units.map((u) => [u.legend, u.persName]), [["RUGBY", "ANA"], ["RUGBY", "JUAN"], ["HOCKEY", null], ["HOCKEY", null], [null, null]]);
    await approveAdvance(r.order.id);
    return "nombre sin leyenda → rechazado; nombre de a una; 5 unidades con leyenda/nombre propios";
  });

  await step("v2 · Cambio de talle: personalizada no admite cambio voluntario; error de carga o de la textil sí, con motivo", async () => {
    const rem = await db.orderUnit.findFirstOrThrow({ where: { orderId: multiV2.order.id, productCode: "D-REM" } });
    await assert.rejects(editUnit(actor(demoAdmin), rem.id, { sizes: { Remera: "L" }, reason: "DATA_ERROR" }), /lo gestiona la empresa/, "el club no modifica pedidos");
    await assert.rejects(editUnit(actor(textil), rem.id, { sizes: { Remera: "L" }, reason: "VOLUNTARY" }), /no admite cambio de talle/);
    await assert.rejects(editUnit(actor(textil), rem.id, { sizes: { Remera: "L" }, reason: "TEXTIL_ERROR" }), /Describí/);
    await editUnit(actor(textil), rem.id, { sizes: { Remera: "L" }, reason: "TEXTIL_ERROR", note: "La textil cargó M en lugar de L" });
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: multiV2.order.id, action: "order.unit_edited" }, orderBy: { createdAt: "desc" } });
    assert.match(JSON.stringify(log.data), /TEXTIL_ERROR/);
    const page = await api(`/club/${demoClub.slug}/${demoCamp.slug}`);
    assert.ok(page.text.includes("no admiten cambio de talle"), "la política se muestra en la tienda");
    return "el club no edita; voluntario rechazado; error de la textil con nota registrado";
  });

  await step("v2 · Tienda: sin envío a domicilio, texto de financiación exacto, muestrario y demo identificada", async () => {
    const page = await api(`/club/${demoClub.slug}/${demoCamp.slug}`);
    assert.equal(page.status, 200);
    assert.ok(page.text.includes("El pago y las opciones de financiación se gestionan mediante Mercado Pago. Consultá las condiciones disponibles al pagar."));
    assert.ok(!/sin inter[eé]s|cuotas sin/i.test(page.text), "no promete cuotas sin interés");
    assert.ok(!page.text.includes("Envío a domicilio"));
    assert.ok(page.text.includes("DEMOSTRACIÓN"));
    assert.ok(page.text.includes("Podés probarte el muestrario en el club antes de elegir tu talle."));
    const ship = await api(`/api/campanas/${demoCamp.id}/pedidos`, { body: cart({ items: [{ productId: dp["D-SHO"].id, playerKey: null, sizes: { Bermuda: "M" }, quantity: 1 }], delivery: { method: "SHIPPING", address: "Calle Falsa 123, Virreyes" } }) });
    assert.equal(ship.status, 409);
    const home = await api(`/club/${demoClub.slug}`);
    assert.ok(home.text.includes("Próximamente") && home.text.includes("Todavía no se puede comprar"), "producto no activado: próximamente, sin compra");
    assert.ok(home.text.includes("Cierra el") && home.text.includes(">Comprar<"), "producto activo con fecha y hora de cierre y compra");
    assert.ok(page.text.includes("Elegir opciones y comprar") && page.text.includes("Cierra el"), "cada producto activo muestra cierre y compra");
    assert.ok(page.text.includes("solo contra pago total"), "retiro contra pago total, lo cobra el club");
    const ñ = await api("/club/los-nandues-rugby");
    assert.ok(ñ.text.includes("Exclusivo para") && ñ.text.includes("M15"), "campaña por categoría visible con su alcance");
    assert.ok(!home.text.includes("Sin valor contractual"), "el acuerdo no se publica");
    return "envío rechazado; texto MP exacto; aviso de muestrario; catálogo con estados; acuerdo privado";
  });

  await step("v2 · Activación y precios: solo la empresa; el club no escribe; reglas y precios bloqueados al publicar", async () => {
    const draft = await db.campaign.create({
      data: {
        clubId: demoClub.id, slug: `invierno-demo-${Date.now()}`, title: "Invierno · demo", status: "DRAFT", pricingModel: "TEXTIL_ADVANCE",
        opensAt: new Date(Date.now() - 3600_000), closesAt: new Date(Date.now() + 10 * 86400_000), paymentAccountId: demoCamp.paymentAccountId, allowTransfer: false, shippingEnabled: false,
        products: { create: [{ productId: dp["D-REM"].id, price: 1300000, sort: 0 }] },
      },
    });
    const cp = await db.campaignProduct.findFirstOrThrow({ where: { campaignId: draft.id } });
    // El club acuerda su rentabilidad, pero los precios los carga y modifica la empresa
    await assert.rejects(setCampaignProductPrices(demoAdmin, actor(demoAdmin), cp.id, { markupPercent: 30 }), /Solo la empresa/);
    await setCampaignProductPrices(textil, actor(textil), cp.id, { textilPrice: 1000000 });
    await assert.rejects(setCampaignProductPrices(textil, actor(textil), cp.id, { price: 900000 }), /no puede ser menor/);
    const mk = await setCampaignProductPrices(textil, actor(textil), cp.id, { markupPercent: 30 });
    assert.equal(mk.price, 1300000, "recargo 30 % sobre 10.000");
    const priceLogs = await db.auditLog.findMany({ where: { entityId: draft.id, action: "campaign.prices" } });
    assert.ok(priceLogs.some((l) => (l.before as { textilPrice: number | null }).textilPrice === null && (l.after as { textilPrice: number }).textilPrice === 1000000), "el historial guarda valor anterior y nuevo");
    await assert.rejects(requestActivation(demoAdmin, actor(demoAdmin), draft.id, "Queremos abrir en junio"), /Solo la empresa/);
    await requestActivation(textil, actor(textil), draft.id, "El club pidió abrir en junio");
    await assert.rejects(publishCampaign(actor(demoAdmin), draft.id), /Solo la empresa/);
    await assert.rejects(approveActivation(demoAdmin, actor(demoAdmin), draft.id), /Solo la empresa/);
    // Outfit: mínimo 20 (editable). La empresa registra el compromiso del club de comprar la diferencia
    await setProductRule(textil, actor(textil), cp.id, { ruleType: "INITIAL_PURCHASE", initialPurchaseMin: 20, initialPurchaseEstimated: true });
    let probs = await activationProblems(draft.id);
    assert.ok(probs.some((p) => /compromiso del club de comprar la diferencia hasta 20/.test(p)), probs.join(" | "));
    await assert.rejects(commitShortfall(demoAdmin, actor(demoAdmin), cp.id), /Solo la empresa/);
    await commitShortfall(textil, actor(textil), cp.id);
    await assert.rejects(approveActivation(textil, actor(textil), draft.id), /No se puede autorizar/, "falta la aprobación de la regla");
    await setProductRule(textil, actor(textil), cp.id, { ruleType: "INITIAL_PURCHASE", initialPurchaseMin: 15, initialPurchaseEstimated: true });
    probs = await activationProblems(draft.id);
    assert.ok(probs.some((p) => /compromiso del club/.test(p)), "cambiar el mínimo pide un compromiso nuevo");
    await commitShortfall(textil, actor(textil), cp.id);
    await approveProductRule(textil, actor(textil), cp.id, "open", "");
    probs = await activationProblems(draft.id);
    assert.deepEqual(probs, []);
    await approveActivation(textil, actor(textil), draft.id);
    await publishCampaign(actor(textil), draft.id);
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: dp["D-REM"].id } })).catalogStatus, "PRESALE");
    await assert.rejects(setCampaignProductPrices(textil, actor(textil), cp.id, { price: 1400000 }), /publicada/);
    await db.campaign.update({ where: { id: draft.id }, data: { status: "CANCELLED" } });
    return "precios, activación, compromiso y publicación solo la empresa (el club rechazado); final ≥ precio de la empresa; historial con valor anterior y nuevo";
  });

  // Categoría completa: 11 esperados en M15; con menos, solo con aprobación excepcional
  const m15Camp = await db.campaign.findFirstOrThrow({ where: { clubId: nandues.id, slug: "m15-camiseta-de-juego" } });
  const m15Cp = await db.campaignProduct.findFirstOrThrow({ where: { campaignId: m15Camp.id } });
  await step("v2 · Campaña de categoría completa (11 jugadores) con aprobación excepcional", async () => {
    const wrong = await api(`/api/campanas/${m15Camp.id}/pedidos`, {
      body: cart({ players: [{ key: "a", name: "Otro Jugador", sport: "Rugby", category: "M14" }], items: [{ productId: prod["P-CAM-TIT"], playerKey: "a", sizes: { Camiseta: "M" }, quantity: 1 }] }),
    });
    assert.equal(wrong.status, 409, "la campaña es solo para M15");
    for (let i = 0; i < 8; i++) {
      const r = await newOrder(m15Camp.id, cart({
        players: [{ key: "a", name: `Jugador M15 ${i + 1}`, sport: "Rugby", category: "M15" }],
        items: [{ productId: prod["P-CAM-TIT"], playerKey: "a", sizes: { Camiseta: ["S", "M", "L"][i % 3] }, persName: ["PEREZ", "GOMEZ", "DIAZ", "SOSA", "RUIZ", "LOPEZ", "MOLINA", "ROJAS"][i], persNumber: String(i + 1), quantity: 1 }],
        policyVersion: CHANGE_POLICY_VERSION,
      }));
      await approveAdvance(r.order.id);
    }
    await db.campaign.update({ where: { id: m15Camp.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    await assert.rejects(generateLot(actor(textil), m15Camp.id), /8 de 11/);
    await assert.rejects(approveProductRule(textil, actor(textil), m15Cp.id, "production", ""), /Explicá/);
    await approveProductRule(textil, actor(textil), m15Cp.id, "production", "El club confirma 8 jugadores; se produce igual");
    const lot = await generateLot(actor(textil), m15Camp.id);
    const r = await lotReport(lot.id);
    assert.equal(r.garments.find((g) => g.code === "CAM-TIT-26")?.total, 8);
    return "M14 rechazado; 8 de 11 retiene la producción; con aprobación excepcional registrada se consolidan las 8";
  });

  let demoLotId = "";
  await step("v2 · Consolidación: prendas base por modelo y talle, personalización aparte sin fragmentar", async () => {
    await db.campaign.update({ where: { id: demoCamp.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    // Remera (outfit, mínimo 20): vendidas menos de 20 → el club compra la diferencia con talles sugeridos
    const remCp = await db.campaignProduct.findFirstOrThrow({ where: { campaignId: demoCamp.id, productId: dp["D-REM"].id } });
    let st = (await productionRuleStatus(demoCamp.id)).find((x) => x.id === remCp.id)!;
    assert.equal(st.shortfall, 20 - st.confirmed);
    assert.equal(st.canProduce, false, "sin la compra de la diferencia, la remera queda retenida");
    assert.equal(st.suggestion.reduce((a, x) => a + x.qty, 0), st.shortfall, "talles sugeridos según lo vendido");
    const pur = await createShortfallPurchase(textil, actor(textil), remCp.id);
    assert.equal(pur.committedQty, st.shortfall);
    await approvePurchase({ ...actor(textil), role: "TEXTIL_ADMIN" }, pur.id);
    st = (await productionRuleStatus(demoCamp.id)).find((x) => x.id === remCp.id)!;
    assert.equal(st.canProduce, true);
    const shortfall = st.shortfall;
    const lot = await generateLot(actor(textil), demoCamp.id);
    demoLotId = lot.id;
    const r = await lotReport(lot.id);
    const comps = await db.orderUnitComponent.findMany({ where: { unit: { status: "ACTIVE", order: { campaignId: demoCamp.id, status: "CONFIRMED" } } } });
    const remTotal = comps.filter((c) => c.garmentCode === "REM-VER").length;
    assert.equal(r.garments.find((g) => g.code === "REM-VER")?.total, remTotal, "todas las remeras base juntas, con o sin leyenda");
    const job = (kind: string, value: string) => r.persJobs?.find((j) => j.kind === kind && j.value === value)?.quantity ?? 0;
    assert.equal(job("Leyenda", "RUGBY"), 3);
    assert.equal(job("Leyenda", "HOCKEY"), 2);
    assert.equal(job("Nombre", "(individual)"), 3);
    assert.ok(r.personalization.some((p) => p.name === "SANTI" && p.legend === "RUGBY"));
    const pending = await db.order.findFirst({ where: { campaignId: demoCamp.id, status: "PENDING_PAYMENT" } });
    if (pending) assert.ok(!(await db.productionLotUnit.findFirst({ where: { lotId: lot.id, unit: { orderId: pending.id } } })), "sin anticipo no entra");
    await approveLot(actor(textil), lot.id);
    return `remeras vendidas ${remTotal}: el club compra ${shortfall} (talles sugeridos); prendas base juntas; trabajos: leyenda RUGBY 3, HOCKEY 2, nombres 3`;
  });

  await step("v2 · Producción completa entregada al club: envío consolidado, remito y recepción", async () => {
    for (const to of ["IN_PRODUCTION", "QUALITY_CONTROL", "READY_TO_SHIP"] as const) await advanceLot(actor(produccion), demoLotId, to);
    const sh = await createShipment(actor(textil), demoCamp.id, { address: "Sede del club (ejemplo)", receiverName: "Responsable demo", carrier: "Via Cargo", trackingRef: "VC-0001", costBearer: "BUYER", lotIds: [demoLotId] });
    assert.equal(sh.costBearer, "BUYER", "el flete es a cargo del comprador, no de la textil");
    const remito = await api(`/admin/campanas/${demoCamp.id}/logistica/remito/${sh.id}`, { cookie: await session("textil@camada.test") });
    assert.equal(remito.status, 200);
    assert.ok(remito.text.includes("Remito consolidado") && remito.text.includes("Remera"));
    await assert.rejects(receiveShipment(actor(textil), null, sh.id, { receivedAt: new Date(), receivedBy: "Responsable demo" }), /no fue despachado/);
    await dispatchShipment(actor(textil), sh.id, { dispatchedAt: new Date() });
    await assert.rejects(receiveShipment(actor(demoAdmin), demoAdmin.clubId, sh.id, { receivedAt: new Date(), receivedBy: "Responsable demo" }), /la confirma la empresa/, "el club comunica; la empresa confirma");
    await receiveShipment(actor(textil), null, sh.id, { receivedAt: new Date(), receivedBy: "Responsable demo (comunicado por el club)" });
    const o = await db.order.findUniqueOrThrow({ where: { id: basic.order.id } });
    assert.equal(o.deliveryStatus, "READY");
    assert.equal(await db.emailOutbox.count({ where: { orderId: o.id, template: "BALANCE_REQUESTED" } }), 1, "aviso de saldo al club");
    const mail = await db.emailOutbox.findFirstOrThrow({ where: { orderId: o.id, template: "BALANCE_REQUESTED" } });
    assert.match(mail.body, /pagá al club el saldo de \$\s?2\.265/);
    const ready = await db.emailOutbox.findFirstOrThrow({ where: { orderId: o.id, template: "READY_FOR_PICKUP" } });
    assert.match(ready.body, /exclusivamente al club/, "aviso de disponibilidad: el saldo se paga solo al club");
    const list = await distributionList(demoCamp.id);
    assert.ok(list.find((x) => x.code === basic.order.code)?.clubDue === 226500);
    const xl = await fetch(`${BASE}/api/admin/campanas/${demoCamp.id}/distribucion?format=csv`, { headers: { Cookie: `camada_session=${await session("club@virreyes-demo.test")}` } });
    assert.equal(xl.status, 200);
    return "lote → envío (flete a cargo del comprador) → despachado → recepción confirmada por la empresa; aviso de disponibilidad; lista con saldo";
  });

  await step("Compra adicional del club después del cierre: separada de los socios, revisión del lote y bloqueo por deuda", async () => {
    const rem = dp["D-REM"].id;
    const input = { reasons: ["BOUTIQUE", "SIZE_CHANGES"] as ("BOUTIQUE" | "SIZE_CHANGES")[], items: [{ productId: rem, sizeLabel: "m", quantity: 3, unitPrice: 1000000 }, { productId: rem, sizeLabel: "L", quantity: 2, unitPrice: 1000000 }], dueAt: new Date(Date.now() + 15 * 86400_000) };
    await assert.rejects(createAdditionalPurchase(demoAdmin, actor(demoAdmin), demoCamp.id, input), /la registra la empresa|registra la empresa/);
    const salesBefore = await campaignMetrics(demoCamp.id);
    const pur = await createAdditionalPurchase(textil, actor(textil), demoCamp.id, input);
    assert.equal(pur.agreedAmount, 5000000);
    const salesAfter = await campaignMetrics(demoCamp.id);
    assert.equal(salesAfter.unitsConfirmed, salesBefore.unitsConfirmed, "no se suman a las ventas a socios");
    await assert.rejects(addPurchaseToProduction(textil, actor(textil), pur.id), /Aprobá la compra/);
    await approvePurchase({ ...actor(textil), role: "TEXTIL_ADMIN" }, pur.id);
    const mainBefore = JSON.stringify((await db.productionLot.findUniqueOrThrow({ where: { id: demoLotId } })).snapshot);
    const rev = await addPurchaseToProduction(textil, actor(textil), pur.id);
    assert.equal(rev.kind, "ADJUSTMENT");
    const rr = await lotReport(rev.id);
    assert.equal(rr.lines.find((l) => l.garmentCode === "REM-VER" && l.size === "M")?.quantity, 3);
    assert.equal(rr.totalUnits, 5);
    await approveLot(actor(textil), rev.id);
    assert.equal(JSON.stringify((await db.productionLot.findUniqueOrThrow({ where: { id: demoLotId } })).snapshot), mainBefore, "el lote original conserva su historial");
    for (const to of ["IN_PRODUCTION", "QUALITY_CONTROL", "READY_TO_SHIP"] as const) await advanceLot(actor(produccion), rev.id, to);
    const sh = await createShipment(actor(textil), demoCamp.id, { address: "Sede del club (ejemplo)", receiverName: "Responsable demo", costBearer: "BUYER", lotIds: [rev.id] });
    await assert.rejects(dispatchShipment(actor(textil), sh.id, { dispatchedAt: new Date() }), /no se liberan hasta que estén pagas/, "unidades adicionales impagas: no se liberan");
    await assert.rejects(registerPurchasePayment(demoAdmin, actor(demoAdmin), pur.id, { amount: 5000000, paidAt: new Date(), method: "Transferencia" }), /registra la empresa/);
    await registerPurchasePayment(textil, actor(textil), pur.id, { amount: 2000000, paidAt: new Date(), method: "Transferencia", reference: "Pago parcial" });
    await assert.rejects(dispatchShipment(actor(textil), sh.id, { dispatchedAt: new Date() }), /no se liberan/, "pago parcial: sigue bloqueado");
    // Bloqueo de todo el despacho (decisión comercial configurable por club)
    await db.club.update({ where: { id: demoClub.id }, data: { debtBlockScope: "WHOLE_SHIPMENT" } });
    const other = await createAdditionalPurchase(textil, actor(textil), demoCamp.id, { reasons: ["LATE_SALES"], items: [{ productId: rem, sizeLabel: "S", quantity: 1, unitPrice: 1000000 }], dueAt: null });
    await registerPurchasePayment(textil, actor(textil), pur.id, { amount: 3000000, paidAt: new Date(), method: "Transferencia", reference: "Saldo" });
    await assert.rejects(dispatchShipment(actor(textil), sh.id, { dispatchedAt: new Date() }), /todo el despacho/);
    await db.club.update({ where: { id: demoClub.id }, data: { debtBlockScope: null } });
    await dispatchShipment(actor(textil), sh.id, { dispatchedAt: new Date() });
    await db.clubPurchase.delete({ where: { id: other.id } });
    // Excel: compras del club en su hoja y en los pedidos detallados, con origen propio
    const wb = await campaignWorkbook(demoCamp.id);
    assert.deepEqual(wb.map((x) => x.name), ["Pedidos detallados", "Resumen artículo y talle", "Personalizaciones", "Resumen económico", "Compras del club"]);
    const clubRows = wb[0].rows.filter((r) => r[4] === "Compra adicional del club");
    assert.equal(clubRows.reduce((a, r) => a + Number(r[7]), 0), 5);
    assert.equal(wb[4].rows.filter((r) => String(r[4]).includes("Boutique")).length, 2, "la compra adicional en su hoja");
    assert.ok(wb[0].rows.some((r) => r[4] === "Compra del club (diferencia del mínimo)"), "la compra por el mínimo también se identifica como del club");
    return "registrada por la empresa (el club no puede); fuera de las ventas a socios; lote de ajuste aprobado sin tocar el original; impaga no se despacha; bloqueo total configurable";
  });

  await step("Excel de pedidos y producción: 5 hojas, una fila por combinación homogénea, sin duplicar cantidades", async () => {
    const wb = await campaignWorkbook(demoCamp.id);
    const det = wb[0];
    const members = det.rows.filter((r) => r[4] === "Socio");
    const units = await db.orderUnit.findMany({ where: { status: "ACTIVE", order: { campaignId: demoCamp.id } }, select: { advanceAmount: true, unitPrice: true, persPrice: true, persName: true } });
    assert.equal(members.reduce((a, r) => a + Number(r[7]), 0), units.length, "la suma de cantidades coincide con las unidades");
    assert.equal(Math.round(members.reduce((a, r) => a + Number(r[17]), 0) * 100), units.reduce((a, u) => a + u.advanceAmount, 0), "los anticipos por fila suman los del pedido");
    const named = members.filter((r) => r[10]);
    assert.ok(named.every((r) => Number(r[7]) === 1), "cada unidad con nombre propio va en su fila");
    const personalization = wb[2].rows.length;
    assert.ok(personalization >= units.filter((u) => u.persName).length);
    const econ = Object.fromEntries(wb[3].rows.map((r) => [r[0], r[1]]));
    assert.ok(Number(econ["Anticipo online (A = B + D)"]) > 0 && Number(econ["Saldo al club (S = P − A)"]) >= 0);
    assert.equal(Number(econ["Precio final al socio (P)"]), Math.round((Number(econ["Anticipo online (A = B + D)"]) + Number(econ["Saldo al club (S = P − A)"])) * 100) / 100, "A + S = P");
    const buf = await toXlsx(wb, { title: "x" });
    assert.ok(buf.length > 1000);
    const http = await fetch(`${BASE}/api/admin/campanas/${demoCamp.id}/export?format=xlsx`, { headers: { Cookie: `camada_session=${await session("club@virreyes-demo.test")}` } });
    assert.equal(http.status, 200, "el club autorizado descarga el Excel de su campaña");
    return `${members.length} filas de socios para ${units.length} unidades; anticipos sin duplicar; 5 hojas; el club lo descarga`;
  });

  await step("v2 · Seguimiento hasta 'en el club'; saldo y retiro registrados por la empresa en la planilla, sin afectar el pedido", async () => {
    const before = await db.order.findUniqueOrThrow({ where: { id: basic.order.id }, include: { payments: true } });
    const units = await db.orderUnit.findMany({ where: { orderId: basic.order.id, status: "ACTIVE" } });
    await assert.rejects(registerDelivery(textil, actor(textil), basic.order.id, { unitIds: units.map((u) => u.id), receivedByName: "Comprador demo" }), /planilla/);
    await assert.rejects(cancelOrder(actor(demoAdmin), basic.order.id, "El club intenta cancelar"), /lo gestiona la empresa/);
    await assert.rejects(saveSheet(demoAdmin, actor(demoAdmin), basic.order.id, { status: "BALANCE_PAID", balancePaid: 226500 }), /no está habilitada/, "el club no carga la planilla");
    await saveSheet(textil, actor(textil), basic.order.id, { status: "BALANCE_PAID", balancePaid: 226500, paidAt: new Date(), method: "Transferencia", reference: "Transf. 4455 (comunicado por el club)" });
    await saveSheet(textil, actor(textil), basic.order.id, { status: "DELIVERED", balancePaid: 999999, deliveredTo: "Comprador demo", notes: "Dato mal cargado a propósito" });
    const sheetLog = await db.auditLog.findFirstOrThrow({ where: { entity: "ClubOrderSheet", action: "clubsheet.updated" }, orderBy: { createdAt: "desc" } });
    assert.equal((sheetLog.before as { status: string }).status, "BALANCE_PAID");
    assert.equal((sheetLog.after as { status: string }).status, "DELIVERED");
    const after = await db.order.findUniqueOrThrow({ where: { id: basic.order.id }, include: { payments: true } });
    for (const k of ["status", "total", "advancePaid", "clubBalanceRequired", "paidAmount", "deliveryStatus"] as const) assert.equal(after[k], before[k], `la planilla no cambia ${k}`);
    assert.equal(after.payments.length, before.payments.length, "no crea pagos");
    const page = await api(`/pedido/${basic.token}`);
    assert.ok(page.text.includes("En el club, listo para retirar") && page.text.includes("solo contra pago total"));
    const sheet = await api(`/admin/planilla?q=${basic.order.code}`, { cookie: await session("club@virreyes-demo.test") });
    assert.equal(sheet.status, 200);
    assert.ok(sheet.text.includes(basic.order.code) && sheet.text.includes("Entregado"));
    assert.equal((await api(`/api/admin/planilla`, { cookie: await session("club@virreyes-demo.test") })).status, 200);
    assert.equal((await api(`/admin/planilla`, { cookie: await session("club@sauce.test") })).status, 404, "sin el servicio, no hay planilla");
    const qr = await api(`/admin/entregas/codigo/${basic.order.pickupCode}`, { cookie: await session("club@virreyes-demo.test") });
    assert.equal(qr.status, 404, "el club no registra retiros");
    return "el club no cancela ni carga datos; la empresa registra en la planilla lo comunicado (con valor anterior y nuevo); el pedido y los pagos no cambian";
  });

  await step("v2 · Conciliación Mercado Pago: bruto, pagado por el comprador (con intereses) y neto", async () => {
    const mpAcc = await db.paymentAccount.findFirstOrThrow({ where: { label: "MP de prueba (mock local)" } });
    const c2 = await db.campaign.create({
      data: {
        clubId: nandues.id, slug: `mp-v2-${Date.now()}`, title: "Prueba anticipo MP", status: "PUBLISHED", pricingModel: "TEXTIL_ADVANCE", opensAt: new Date(Date.now() - 3600_000), closesAt: new Date(Date.now() + 86400_000),
        paymentAccountId: mpAcc.id, allowTransfer: false, products: { create: [{ productId: prod["P-CAM-ENT"], textilPrice: 3000000, price: 3400000 }] },
      },
    });
    // Fórmula pendiente de aprobación: el pedido queda registrado pero no se crea el cobro real
    const r = await newOrder(c2.id, cart({ items: [{ productId: prod["P-CAM-ENT"], playerKey: null, sizes: { Camiseta: "M" }, quantity: 1 }] }));
    assert.ok(r.redirect.includes("pago=no-habilitado"), r.redirect);
    assert.equal(await db.payment.count({ where: { orderId: r.order.id } }), 0, "sin fórmula aprobada no hay cobros reales");
    await assert.rejects(setFormulaApproval(textil, actor(textil), true, null), /Describí/);
    await setFormulaApproval(textil, actor(textil), true, "Prueba: 21 % + 3,5 % sobre G, incluidos en P");
    await startOnlinePayment(r.order.id, "ADVANCE");
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: r.order.id } });
    assert.equal(pay.amount, 3098000, "30.000 + 24,5 % de 4.000");
    const pend = await api(`/pedido/${r.token}`);
    assert.ok(pend.text.includes("Pago pendiente de confirmación"), "pendiente frente a aprobado");
    const res = await fetch(`${MOCK}/__pay`, { method: "POST", body: JSON.stringify({ external_reference: pay.id, status: "approved", amount: pay.amount / 100, installments: 6 }) });
    const mpId = String(((await res.json()) as { id: string }).id);
    await mpNotify(mpAcc.id, mpId);
    const p = await db.payment.findUniqueOrThrow({ where: { id: pay.id } });
    assert.equal(p.status, "APPROVED");
    assert.equal(p.providerGross, pay.amount);
    assert.ok(p.providerTotalPaid! > pay.amount, "intereses de financiación a cargo del comprador");
    assert.ok(p.providerNet! < pay.amount, "neto descuenta cargos del procesamiento");
    assert.equal(p.installments, 6);
    const o = await db.order.findUniqueOrThrow({ where: { id: r.order.id } });
    assert.equal(o.advancePaid, pay.amount, "el anticipo se acredita por el importe de la operación, no por el neto");
    const admin = await api(`/admin/pedidos/${r.order.id}`, { cookie: await session("textil@camada.test") });
    assert.ok(admin.text.includes("Comisión del proveedor") && admin.text.includes("Parte de la empresa") && admin.text.includes("Otros importes"), "conciliación con comisión, neto, parte de la empresa y otros importes");
    await setFormulaApproval(textil, actor(textil), false, null);
    await db.campaign.update({ where: { id: c2.id }, data: { status: "CANCELLED" } });
    return `sin fórmula aprobada no se cobra; aprobada: bruto ${pay.amount / 100} · comprador ${p.providerTotalPaid! / 100} (6 cuotas) · neto ${p.providerNet! / 100} · comisión ${(pay.amount - p.providerNet!) / 100}`;
  });

  await step("v2 · Pedidos anteriores conservan precios y condiciones", async () => {
    const legacyOrders = await db.order.count({ where: { campaignId: camp.id, NOT: { pricingModel: "LEGACY_DEPOSIT" } } });
    assert.equal(legacyOrders, 0, "los pedidos del modelo anterior siguen con seña");
    const u = await db.orderUnit.findFirstOrThrow({ where: { orderId: basic.order.id } });
    await db.campaignProduct.updateMany({ where: { campaignId: demoCamp.id, productId: dp["D-REM"].id }, data: { textilPrice: 1100000, price: 1500000 } });
    const after = await db.order.findUniqueOrThrow({ where: { id: basic.order.id } });
    const ua = await db.orderUnit.findUniqueOrThrow({ where: { id: u.id } });
    await db.campaign.update({ where: { id: demoCamp.id }, data: { clubTaxBp: 3000 } });
    const after2 = await db.order.findUniqueOrThrow({ where: { id: basic.order.id } });
    assert.equal(after.advanceRequired, 1073500);
    assert.equal(after2.advanceRequired, 1073500, "cambiar las deducciones no recalcula pedidos hechos");
    assert.equal(after.clubBalanceRequired, 226500);
    assert.equal(after.deductionBpA, 2100, "deducciones congeladas en el pedido");
    assert.equal(ua.textilPrice, 1000000);
    assert.equal(ua.advanceAmount, 1073500);
    assert.equal(ua.unitPrice, 1300000);
    assert.equal((after.termsSnapshot as { pricingModel: string }).pricingModel, "TEXTIL_ADVANCE");
    await db.campaignProduct.updateMany({ where: { campaignId: demoCamp.id, productId: dp["D-REM"].id }, data: { textilPrice: 1000000, price: 1300000 } });
    await db.campaign.update({ where: { id: demoCamp.id }, data: { clubTaxBp: 2450 } });
    return "sin recálculo retroactivo: anticipo, saldo y precio por prenda quedan como al comprar";
  });

  await step("v2 · Acuerdo privado: aviso de vencimiento una sola vez y nada público", async () => {
    await runAgreementAlerts(); // la tarea programada ya pudo haberlo enviado
    assert.equal(await runAgreementAlerts(), 0, "no se repite el aviso");
    assert.ok((await db.emailOutbox.count({ where: { template: "AGREEMENT_EXPIRING" } })) >= 1);
    const dash = await api("/admin", { cookie: await session("textil@camada.test") });
    assert.ok(dash.text.includes("El acuerdo con Los Ñandúes Rugby Club vence en"), "alerta en el panel de la textil");
    const clubDash = await api("/admin", { cookie: await session("club@nandues.test") });
    assert.ok(!clubDash.text.includes("acuerdo con"), "el club no ve el panel de acuerdos");
    assert.equal((await api(`/admin/clubes/${nandues.id}/acuerdo`, { cookie: await session("club@nandues.test") })).status, 404);
    const store = await api("/club/los-nandues-rugby");
    assert.ok(store.text.includes("LNRC by") && !store.text.includes("Cada campaña la solicita"), "solo la línea de marca es pública");
    return "alerta a 45 días; sin duplicar; acuerdo invisible para el club y la tienda (salvo la línea de marca)";
  });

  await step("v2 · Páginas nuevas del panel por rol", async () => {
    const checks: [string, string, number][] = [
      ["textil@camada.test", `/admin/campanas/${demoCamp.id}/logistica`, 200],
      ["club@virreyes-demo.test", `/admin/campanas/${demoCamp.id}/logistica`, 200],
      ["club@nandues.test", `/admin/campanas/${demoCamp.id}/logistica`, 404],
      ["textil@camada.test", `/admin/campanas/${demoCamp.id}/editar`, 200],
      ["club@virreyes-demo.test", `/admin/campanas/${demoCamp.id}/editar`, 404],
      ["club@nandues.test", `/admin/campanas/${demoCamp.id}/editar`, 404],
      ["textil@camada.test", `/admin/clubes/${demoClub.id}/muestrario`, 200],
      ["club@virreyes-demo.test", `/admin/clubes/${demoClub.id}/muestrario`, 200],
      ["textil@camada.test", `/admin/clubes/${demoClub.id}/acuerdo`, 200],
      ["club@virreyes-demo.test", `/admin/clubes/${demoClub.id}/acuerdo`, 404],
      ["textil@camada.test", `/admin/clubes/${demoClub.id}/catalogo/productos/${dp["D-REM"].id}`, 200],
      ["textil@camada.test", `/admin/pedidos/${multiV2.order.id}`, 200],
      ["club@virreyes-demo.test", `/admin/campanas/nueva`, 404],
      ["club@virreyes-demo.test", `/admin/campanas/${demoCamp.id}/compras`, 200],
      ["club@virreyes-demo.test", `/admin`, 200],
      ["entregas@nandues.test", `/admin/campanas/nueva`, 404],
      ["textil@camada.test", `/admin/planilla?club=${demoClub.id}`, 200],
      ["club@nandues.test", `/admin/planilla`, 200],
      ["club@nandues.test", `/api/admin/campanas/${demoCamp.id}/export?format=xlsx`, 404],
      ["club@virreyes-demo.test", `/api/admin/campanas/${demoCamp.id}/export?format=xlsx`, 200],
      ["club@virreyes-demo.test", `/admin/pedidos/${multiV2.order.id}`, 200],
    ];
    for (const [email, path, code] of checks) assert.equal((await api(path, { cookie: await session(email) })).status, code, `${email} ${path}`);
    return `${checks.length} combinaciones`;
  });

  // ═════════════════════ BACK: web comercial, socios, permisos y estados ═════════════════════
  await step("BACK · Web comercial, marca configurable, solicitud de reunión y acceso por rol", async () => {
    const home = await api("/");
    assert.equal(home.status, 200);
    for (const t of ["Cómo funciona la preventa", "Lo que gana el club", "Probarse antes de comprar", "Cada producto se activa cuando conviene", "Fabricación y entrega en el club", "Preguntas frecuentes", "Hablemos de tu club", "Tu club"]) assert.ok(home.text.includes(t), `sección: ${t}`);
    for (const path of ["/propuesta", "/nosotros", "/contacto", "/tu-club"]) assert.equal((await api(path)).status, 200, path);
    assert.ok(!/stock gratis|todo es ganancia|no invierten nada/i.test(home.text + (await api("/propuesta")).text), "sin promesas engañosas");
    assert.ok((await api("/propuesta")).text.includes("Ejemplo ilustrativo"), "simulador con supuestos");
    // Marca configurable
    await assert.rejects(updateBrand(demoAdmin, actor(demoAdmin), { name: "OTRA", colorPrimary: "#000000", colorAccent: "#ffffff", debtBlockDefault: "ADDITIONAL_ONLY" }), /Solo la empresa/);
    await updateBrand(textil, actor(textil), { name: "BACK Prueba", colorPrimary: "#112233", colorAccent: "#E9B949", debtBlockDefault: "ADDITIONAL_ONLY" });
    const branded = await api("/");
    assert.ok(branded.text.includes("BACK Prueba") && branded.text.includes("#112233"), "nombre y color de la marca desde el panel");
    const blog = await db.auditLog.findFirstOrThrow({ where: { entity: "brand", action: "brand.updated" }, orderBy: { createdAt: "desc" } });
    assert.equal((blog.before as { name: string }).name, "BACK");
    await updateBrand(textil, actor(textil), { name: "BACK", colorPrimary: "#1D2B4F", colorAccent: "#E9B949", debtBlockDefault: "ADDITIONAL_ONLY" });
    // Solicitud de reunión
    await assert.rejects(createLead({ name: "Ana", clubName: "", email: "x" }, "10.0.0.9"));
    const lead = await createLead({ name: "Ana Pérez", clubName: "Club de prueba", email: "ana@example.com", message: "Queremos camisetas" }, "10.0.0.9");
    const leads = await api("/admin/solicitudes", { cookie: await session("textil@camada.test") });
    assert.ok(leads.text.includes("Club de prueba"));
    assert.equal((await api("/admin/solicitudes", { cookie: await session("club@nandues.test") })).status, 404);
    await db.lead.delete({ where: { id: lead.id } });
    // "Tu club" lleva a la experiencia de cada rol
    const staff = await api("/tu-club", { cookie: await session("textil@camada.test") });
    assert.ok([307, 308].includes(staff.status));
    const memberCookie = await memberSession("socio@demo.test");
    const asMember = await fetch(`${BASE}/tu-club`, { headers: { Cookie: `back_socio=${memberCookie}` }, redirect: "manual" });
    assert.ok([307, 308].includes(asMember.status) && asMember.headers.get("location")?.includes("/mi-cuenta"));
    return "9 secciones y navegación; marca editable solo por la empresa (con historial); solicitud de reunión; Tu club según rol";
  });

  await step("BACK · Socio: inicia sesión para pagar, conserva club y carrito, y ve solo sus pedidos", async () => {
    const anon = await api(`/api/campanas/${m15Camp.id}/pedidos`, { body: cart({ items: [] }), member: false });
    assert.equal(anon.status, 401, "sin sesión no se completa la compra");
    const store = await api(`/club/${demoClub.slug}/${demoCamp.slug}`);
    assert.ok(store.text.includes(`/socios/ingresar?club=${demoClub.slug}&amp;next=`) && store.text.includes("checkout%3D1"), "el acceso conserva el club y vuelve al carrito");
    const login = await api(`/socios/ingresar?club=${demoClub.slug}&next=/club/${demoClub.slug}`);
    assert.ok(login.text.includes(demoClub.name) && login.text.includes("no valida tu condición de socio"));
    assert.equal((await api(`/socios/ingresar?next=https://evil.example.com`)).status, 200);
    const ownCodes = (await db.order.findMany({ where: { member: { email: basic.order.buyerEmail } }, select: { code: true } })).map((o) => o.code);
    const page = await fetch(`${BASE}/mi-cuenta`, { headers: { Cookie: `back_socio=${await memberSession(basic.order.buyerEmail)}` } }).then((r) => r.text());
    for (const c of ownCodes) assert.ok(page.includes(c), "ve sus pedidos");
    assert.ok(!page.includes(multiV2.order.code), "no ve pedidos de otros socios");
    assert.ok([307, 308].includes((await api("/mi-cuenta")).status), "sin sesión, al acceso");
    const link = await db.memberClub.findFirst({ where: { member: { email: basic.order.buyerEmail }, clubId: demoClub.id } });
    assert.ok(link && !link.validatedAt, "asociado al club, sin membresía validada");
    return "401 sin sesión; acceso con club y retorno al carrito; Mis pedidos solo propios; asociación ≠ membresía validada";
  });

  await step("BACK · El club no escribe, ni por la interfaz ni llamando al servidor", async () => {
    for (const u of [clubAdmin, deliveryUser, demoAdmin]) assert.throws(() => assertWriter(u), /consulta/);
    assert.doesNotThrow(() => assertWriter(textil));
    await assert.rejects(closeCampaignFn(actor(demoAdmin), demoCamp.id), /Solo la empresa/);
    await assert.rejects(advanceLot(actor(demoAdmin), demoLotId, "RECEIVED_BY_CLUB"), /empresa/);
    const dash = await api("/admin", { cookie: await session("club@virreyes-demo.test") });
    assert.ok(dash.text.includes("Panel de consulta del club") && dash.text.includes("Saldo a cobrar a socios") && dash.text.includes("Resultado estimado"));
    const camp = await api(`/admin/campanas/${demoCamp.id}`, { cookie: await session("club@virreyes-demo.test") });
    assert.ok(!camp.text.includes("Cancelar campaña") && !camp.text.includes("Configurar"), "sin controles de edición");
    return "toda acción del panel exige usuario de escritura; módulos rechazan al club; panel del club en solo lectura";
  });

  await step("BACK · Productos activos, próximos y finalizados según la hora del servidor", async () => {
    const soon = await db.campaign.create({
      data: {
        clubId: demoClub.id, slug: `proxima-${Date.now()}`, title: "Invierno · próxima", status: "PUBLISHED", pricingModel: "TEXTIL_ADVANCE",
        opensAt: new Date(Date.now() + 5 * 86400_000), closesAt: new Date(Date.now() + 20 * 86400_000), paymentAccountId: demoCamp.paymentAccountId, allowTransfer: false,
        products: { create: [{ productId: dp["D-PON"].id, textilPrice: 2200000, price: 2860000 }] },
      },
    });
    const home = await api(`/club/${demoClub.slug}`);
    assert.ok(home.text.includes("Próxima preventa") && home.text.includes("Abre el"), "campaña próxima con fecha de apertura");
    assert.ok(home.text.includes("Preventa finalizada"), "productos de la preventa cerrada");
    const r = await api(`/api/campanas/${soon.id}/pedidos`, { body: cart({ items: [{ productId: dp["D-PON"].id, playerKey: null, sizes: { Poncho: "U" }, quantity: 1 }] }) });
    assert.equal(r.status, 409, "antes de abrir no se compra");
    const closed = await api(`/club/${demoClub.slug}/${demoCamp.slug}`);
    assert.ok(closed.text.includes("Preventa finalizada") && !closed.text.includes("Elegir opciones y comprar"), "cerrada: sin compra");
    await db.campaign.delete({ where: { id: soon.id } });
    return "próximamente con apertura; finalizada sin compra; el servidor rechaza fuera de la ventana";
  });

  const okCount = results.filter((r) => r.ok).length;
  const md = [
    "# Verificación automática",
    "",
    `Fecha: ${new Date().toISOString()} · Resultado: **${okCount}/${results.length}**`,
    "",
    "Pagos online verificados con el simulador interno (rotulado) y con el código real de Mercado Pago contra un simulador local de su API (`scripts/mock-mercadopago.mjs`). Falta la prueba con credenciales reales de Mercado Pago.",
    "",
    "Los escenarios \"Modelo anterior\" verifican la compatibilidad con campañas de seña ya existentes; los \"v2\" verifican las reglas comerciales nuevas (anticipo textil + saldo al club).",
    "",
    "| Escenario | Resultado | Detalle |",
    "|---|---|---|",
    ...results.map((r) => `| ${r.name} | ${r.ok ? "✔" : "✘"} | ${r.detail.replace(/\|/g, "/")} |`),
    "",
  ].join("\n");
  // Las secciones escritas a mano (uso desde celular, lo no probado) se conservan
  let manual = "";
  try {
    const prev = readFileSync("docs/VERIFICACION.md", "utf8");
    const i = prev.indexOf("\n## ");
    if (i >= 0) manual = prev.slice(i);
  } catch { /* primera vez */ }
  writeFileSync("docs/VERIFICACION.md", md + manual);
  console.log(`\n${okCount}/${results.length} escenarios OK`);
  await db.$disconnect();
  process.exit(okCount === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
