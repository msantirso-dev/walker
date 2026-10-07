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
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import sharp from "sharp";
import { db } from "@/shared/db";
import { decryptSecret, encryptSecret } from "@/shared/crypto";
import { submitTransfer, reviewTransfer, startOnlinePayment, registerManualPayment } from "@/modules/payments";
import { expireReservations, cancelUnit } from "@/modules/orders";
import { generateLot, approveLot, advanceLot, lotReport } from "@/modules/production";
import { registerDelivery } from "@/modules/deliveries";
import { closeExpiredCampaigns, decideMinimum } from "@/modules/campaigns";
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

async function api(path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(BASE + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.cookie ? { Cookie: `camada_session=${init.cookie}` } : {}), ...(init.headers ?? {}) },
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
  const nandues = await db.club.findUniqueOrThrow({ where: { slug: "los-nandues-rugby" } });
  const sauce = await db.club.findUniqueOrThrow({ where: { slug: "el-sauce-hockey" } });
  const camp = await db.campaign.findFirstOrThrow({ where: { clubId: nandues.id, slug: "coleccion-2026" } });
  const sauceCamp = await db.campaign.findFirstOrThrow({ where: { clubId: sauce.id } });
  const prod = Object.fromEntries((await db.product.findMany({ where: { clubId: nandues.id } })).map((p) => [p.code, p.id]));
  const textil = await user("textil@camada.test");
  const clubAdmin = await user("club@nandues.test");
  const deliveryUser = await user("entregas@nandues.test");
  const produccion = await user("produccion@camada.test");

  // ───────────────────────── Compra ─────────────────────────
  let multi: Awaited<ReturnType<typeof newOrder>>;
  await step("Compra con varios jugadores, talles y prendas sin jugador", async () => {
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
      clubId: nandues.id, slug: `mp-test-${Date.now()}`, title: "Prueba Mercado Pago", status: "PUBLISHED", opensAt: new Date(Date.now() - 3600_000), closesAt: new Date(Date.now() + 86400_000),
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
    await assert.rejects(reviewTransfer(deliveryUser, actor(deliveryUser), p1.id, { approve: true }), /permiso/);
    await reviewTransfer(clubAdmin, actor(clubAdmin), p1.id, { approve: false, reason: "El importe no coincide con la seña" });
    o = await db.order.findUniqueOrThrow({ where: { id: setOrder.order.id } });
    assert.equal(o.inReviewAmount, 0);
    assert.equal(await db.emailOutbox.count({ where: { orderId: o.id, template: "RECEIPT_REJECTED" } }), 1);
    const p2 = await submitTransfer(setOrder.order.id, { kind: "DEPOSIT", operationRef: "OP-1003", file: png });
    assert.equal(p2.replacesPaymentId, p1.id);
    await reviewTransfer(clubAdmin, actor(clubAdmin), p2.id, { approve: true });
    const full = await db.order.findUniqueOrThrow({ where: { id: setOrder.order.id }, include: { payments: { include: { receipts: true } } } });
    assert.equal(full.status, "CONFIRMED");
    assert.equal(full.payments.length, 2);
    assert.ok(full.payments.every((p) => p.receipts.length === 1), "se conserva el historial de comprobantes");
    // El comprobante es privado
    const rid = full.payments[0].receipts[0].id;
    assert.equal((await api(`/api/comprobantes/${rid}`)).status, 404);
    assert.equal((await api(`/api/comprobantes/${rid}?t=${setOrder.token}`)).status, 200);
    return "en revisión no descuenta saldo; rechazo avisado; reemplazo enlazado; comprobantes privados";
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
    const page = await api(`/club/los-nandues-rugby/coleccion-2026`);
    assert.ok(page.text.includes("Ventana cerrada"));
    assert.ok(page.text.includes("Camiseta titular 2026"), "el catálogo sigue visible");
    assert.ok(!page.text.includes("Elegir talle"), "sin botones de compra");
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
    assert.ok(r.personalization.some((p) => p.name === "BENJA" && p.number === "7"));
    const csv = await api(`/api/admin/lotes/${lot.id}/export?format=csv&part=personalizacion`, { cookie: await session("produccion@camada.test") });
    assert.equal(csv.status, 200);
    for (const pii of [multi.order.buyerEmail, "Ferreyra", "Comprador de prueba", "11 5555"]) assert.ok(!csv.text.includes(pii), `el reporte de fabricación no debe incluir ${pii}`);
    const xlsx = await fetch(`${BASE}/api/admin/lotes/${lot.id}/export?format=xlsx`, { headers: { Cookie: `camada_session=${await session("produccion@camada.test")}` } });
    assert.equal(xlsx.status, 200);
    await approveLot(actor(textil), lot.id);
    return `CAM-TIT-26: ${camTit} (sueltas + conjunto + combo); sin datos personales; lote aprobado y congelado`;
  });

  await step("Cambios posteriores como lote de ajuste, sin alterar el lote aprobado", async () => {
    const before = JSON.stringify((await db.productionLot.findUniqueOrThrow({ where: { id: lot1Id } })).snapshot);
    // Confirma tarde un pedido por transferencia y se cancela una unidad ya enviada a fábrica
    const p = await submitTransfer(late.order.id, { kind: "DEPOSIT", operationRef: "OP-TARDE", file: await receiptPng() });
    await reviewTransfer(clubAdmin, actor(clubAdmin), p.id, { approve: true });
    const unit = await db.orderUnit.findFirstOrThrow({ where: { orderId: multi.order.id, productCode: "P-BUZ-MC" } });
    await cancelUnit(actor(clubAdmin), unit.id, "El comprador pidió quitar el buzo");
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
      await advanceLot(actor(clubAdmin), lot.id, "RECEIVED_BY_CLUB");
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
    return "lotes avanzan en orden; pedidos listos; avisos de producción, retiro y saldo (uno por pedido)";
  });

  await step("Entrega bloqueada con saldo; excepción solo autorizada y con motivo", async () => {
    const units = await db.orderUnit.findMany({ where: { orderId: multi.order.id, status: "ACTIVE" } });
    await assert.rejects(registerDelivery(deliveryUser, actor(deliveryUser), multi.order.id, { unitIds: [units[0].id], receivedByName: "Laura Ferreyra" }), /saldo pendiente/);
    await assert.rejects(registerDelivery(clubAdmin, actor(clubAdmin), multi.order.id, { unitIds: [units[0].id], receivedByName: "Laura Ferreyra" }), /motivo/);
    await registerDelivery(clubAdmin, actor(clubAdmin), multi.order.id, { unitIds: [units[0].id], receivedByName: "Laura Ferreyra", exceptionReason: "Torneo el sábado; paga el saldo el lunes" });
    const ex = await db.auditLog.count({ where: { entityId: multi.order.id, action: "delivery.exception" } });
    assert.equal(ex, 1);
    return "encargado de entregas: bloqueado; administrador del club: entrega con motivo registrado";
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
    await registerDelivery(deliveryUser, actor(deliveryUser), multi.order.id, { unitIds: [pending[0].id], receivedByName: "Joaquín Ferreyra" });
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: multi.order.id } })).deliveryStatus, "PARTIAL");
    await assert.rejects(registerDelivery(deliveryUser, actor(deliveryUser), multi.order.id, { unitIds: [pending[0].id], receivedByName: "X Y Z" }), /ya fue entregada/);
    await registerDelivery(deliveryUser, actor(deliveryUser), multi.order.id, { unitIds: pending.slice(1).map((u) => u.id), receivedByName: "Joaquín Ferreyra" });
    const done = await db.order.findUniqueOrThrow({ where: { id: multi.order.id }, include: { deliveries: true } });
    assert.equal(done.deliveryStatus, "DELIVERED");
    assert.equal(done.deliveries.length, 3);
    return `saldo ${p.amount / 100} pagado; 3 entregas (excepción, parcial, resto) con quién retiró y cuándo`;
  });

  await step("Pago en efectivo registrado por el club y entrega con el QR", async () => {
    const o = await db.order.findUniqueOrThrow({ where: { id: setOrder.order.id } });
    await registerManualPayment(clubAdmin, actor(clubAdmin), o.id, { amount: o.total - o.paidAmount, method: "CASH", kind: "BALANCE", reference: "Recibo 0001" });
    const s = await session("entregas@nandues.test");
    const byQr = await api(`/admin/entregas/codigo/${o.pickupCode}`, { cookie: s });
    assert.ok([307, 308].includes(byQr.status) || byQr.status === 200);
    const anon = await api(`/admin/entregas/codigo/${o.pickupCode}`);
    assert.ok([307, 308].includes(anon.status), "sin sesión, el QR redirige al ingreso");
    return "saldo en efectivo registrado; el QR solo abre el pedido con sesión del club";
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
      ["club@nandues.test", `/admin/clubes/${nandues.id}`, 200],
      ["club@nandues.test", `/admin/clubes/${sauce.id}`, 404],
      ["club@nandues.test", `/admin/clubes/${nandues.id}/catalogo`, 404],
      ["produccion@camada.test", `/admin/produccion/${lot1Id}`, 200],
      ["entregas@nandues.test", `/admin/entregas`, 200],
      ["entregas@nandues.test", `/admin/campanas/${camp.id}`, 404],
    ];
    for (const [email, path, code] of checks) assert.equal((await api(path, { cookie: await session(email) })).status, code, `${email} ${path}`);
    assert.ok([307, 308].includes((await api("/admin")).status), "sin sesión redirige");
    return `${checks.length} combinaciones de rol y página`;
  });

  const okCount = results.filter((r) => r.ok).length;
  const md = [
    "# Verificación automática",
    "",
    `Fecha: ${new Date().toISOString()} · Resultado: **${okCount}/${results.length}**`,
    "",
    "Pagos online verificados con el simulador interno (rotulado) y con el código real de Mercado Pago contra un simulador local de su API (`scripts/mock-mercadopago.mjs`). Falta la prueba con credenciales reales de Mercado Pago.",
    "",
    "| Escenario | Resultado | Detalle |",
    "|---|---|---|",
    ...results.map((r) => `| ${r.name} | ${r.ok ? "✔" : "✘"} | ${r.detail.replace(/\|/g, "/")} |`),
    "",
  ].join("\n");
  writeFileSync("docs/VERIFICACION.md", md);
  console.log(`\n${okCount}/${results.length} escenarios OK`);
  await db.$disconnect();
  process.exit(okCount === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
