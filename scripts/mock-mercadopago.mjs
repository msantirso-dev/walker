/**
 * Simulador LOCAL de la API de Mercado Pago, solo para pruebas automáticas.
 * Implementa lo mínimo que usa la app: POST /checkout/preferences y GET /v1/payments/:id.
 * Uso: MOCK_MP_TOKEN=TEST-xxx node scripts/mock-mercadopago.mjs   (puerto 4010)
 * Para registrar un pago (lo que haría el comprador en el checkout): POST /__pay {external_reference, status, amount}
 */
import http from "node:http";

const TOKEN = process.env.MOCK_MP_TOKEN ?? "";
const prefs = new Map();
const payments = new Map();
let seq = 9000000000;

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/__pay") && req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: "invalid token" });
    if (req.method === "POST" && url.pathname === "/checkout/preferences") {
      if (!body.external_reference || !body.items?.[0]?.unit_price || body.items[0].currency_id !== "ARS") return send(res, 400, { message: "bad request" });
      const id = `pref-${prefs.size + 1}`;
      prefs.set(id, body);
      return send(res, 201, { id, init_point: `http://127.0.0.1:4010/checkout/${id}`, sandbox_init_point: `http://127.0.0.1:4010/checkout/${id}` });
    }
    if (req.method === "POST" && url.pathname === "/__pay") {
      const id = String(++seq);
      payments.set(id, { id: Number(id), status: body.status, status_detail: body.status === "approved" ? "accredited" : body.status, transaction_amount: body.amount, currency_id: body.currency ?? "ARS", external_reference: body.external_reference });
      return send(res, 201, { id });
    }
    if (req.method === "PUT" && url.pathname.startsWith("/__pay/")) {
      const p = payments.get(url.pathname.split("/").pop());
      if (!p) return send(res, 404, {});
      p.status = body.status;
      return send(res, 200, p);
    }
    const m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (req.method === "GET" && m) {
      const p = payments.get(m[1]);
      return p ? send(res, 200, p) : send(res, 404, { message: "not found" });
    }
    send(res, 404, { message: "not found" });
  })
  .listen(4010, "127.0.0.1", () => console.log("Mock de Mercado Pago en http://127.0.0.1:4010"));
