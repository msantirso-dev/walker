"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StoreProduct, StoreComponent } from "@/modules/clubs/public";
import { CHANGE_POLICY_TEXT, CHANGE_POLICY_UNPERSONALIZED, CHANGE_POLICY_VERSION, NAME_RE, isVisible, sortGroups, type OptionGroupT } from "@/modules/catalog/options";
import { ars } from "@/shared/money";
import { MP_FINANCING_TEXT, SAMPLE_TEXT } from "@/shared/copy";

type Player = { key: string; name: string; sport: string; category: string; team: string };
type Line = { id: string; productId: string; playerKey: string | null; sizes: Record<string, string>; options: Record<string, string>; quantity: number };

export type StoreConfig = {
  campaignId: string;
  open: boolean;
  model: "LEGACY_DEPOSIT" | "TEXTIL_ADVANCE";
  paymentMode: "FULL" | "DEPOSIT";
  depositType: "PERCENT" | "FIXED";
  depositValue: number;
  pickupEnabled: boolean;
  pickupText: string | null;
  shippingEnabled: boolean;
  shippingPrice: number;
  shippingNotes: string | null;
  memberNumberMode: string;
  mercadopago: boolean;
  simulated: boolean;
  transfer: boolean;
  receiver: string;
  clubName: string;
  sports: string[];
  categories: { name: string; sport: string | null }[];
  audience: "ALL" | "SPORTS" | "CATEGORIES";
  audienceText: string;
  demo: boolean;
  policiesAnchor: string;
};


const GROUP_LABEL: Record<string, string> = { KIDS: "Infantiles", NUMERIC: "Curva 1 · 2 · 3", ALPHA: "Adultos", OTHER: "Otros" };
const TAG_LABEL: Record<string, string> = { REAL: "Foto real", DESIGN: "Diseño", REFERENCE: "Referencia" };

function groupSizes<T extends { group: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const s of list) m.set(s.group, [...(m.get(s.group) ?? []), s]);
  return [...m.entries()];
}

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** Opciones visibles y completadas, con su precio (para mostrar; el servidor recalcula). */
function chosenOptions(groups: OptionGroupT[], sel: Record<string, string>) {
  const out: { g: OptionGroupT; label: string; textil: number; club: number }[] = [];
  for (const g of sortGroups(groups)) {
    if (!isVisible(g, sel)) continue;
    const v = sel[g.id]?.trim();
    if (!v) continue;
    if (g.type === "CHOICE") {
      const val = g.values.find((x) => x.id === v);
      if (val) out.push({ g, label: val.label, textil: val.priceTextil, club: val.priceClub });
    } else out.push({ g, label: v, textil: g.priceTextil, club: g.priceClub });
  }
  return out;
}

/** Selecciones limpias: solo grupos visibles con valor. */
function cleanSelections(groups: OptionGroupT[], sel: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const g of groups) if (isVisible(g, sel) && sel[g.id]?.trim()) out[g.id] = sel[g.id].trim();
  return out;
}

function linePrice(p: StoreProduct, l: Line) {
  const opts = chosenOptions(p.optionGroups, l.options);
  const extraTextil = opts.reduce((a, o) => a + o.textil, 0);
  const extra = opts.reduce((a, o) => a + o.textil + o.club, 0);
  const unit = p.price + extra;
  const advance = (p.textilPrice ?? 0) + extraTextil;
  return {
    base: p.price, extra, unit, total: unit * l.quantity, advance: advance * l.quantity, club: (unit - advance) * l.quantity, opts,
    noSizeChange: opts.some((o) => o.g.blocksSizeChange), freeText: opts.some((o) => o.g.type !== "CHOICE"),
  };
}

export function StoreApp({ products, cfg }: { products: StoreProduct[]; cfg: StoreConfig }) {
  const advanceModel = cfg.model === "TEXTIL_ADVANCE";
  const [players, setPlayers] = useState<Player[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [sheet, setSheet] = useState<StoreProduct | null>(null);
  const [review, setReview] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [buyer, setBuyer] = useState({ name: "", email: "", phone: "", memberNumber: "" });
  const [delivery, setDelivery] = useState<"PICKUP" | "SHIPPING">(advanceModel || cfg.pickupEnabled ? "PICKUP" : "SHIPPING");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(false);
  const [policyOk, setPolicyOk] = useState(false);
  const [payKind, setPayKind] = useState<"DEPOSIT" | "FULL">(cfg.paymentMode === "FULL" ? "FULL" : "DEPOSIT");
  const [payMethod, setPayMethod] = useState<"MERCADOPAGO" | "TRANSFER">(cfg.mercadopago ? "MERCADOPAGO" : "TRANSFER");
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const idem = useRef<string>(uid());

  // Un carrito distinto es un pedido distinto: nueva clave de idempotencia.
  useEffect(() => {
    idem.current = uid();
  }, [lines, players, buyer, delivery, address, payKind, payMethod]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const units = lines.reduce((a, l) => a + l.quantity, 0);
  const anyNoChange = lines.some((l) => {
    const p = byId.get(l.productId);
    return p ? linePrice(p, l).noSizeChange : false;
  });
  const totals = useMemo(() => {
    let items = 0, pers = 0, advance = 0;
    for (const l of lines) {
      const p = byId.get(l.productId);
      if (!p) continue;
      const lp = linePrice(p, l);
      items += lp.base * l.quantity;
      pers += lp.extra * l.quantity;
      advance += lp.advance;
    }
    const ship = !advanceModel && delivery === "SHIPPING" && lines.length ? cfg.shippingPrice : 0;
    const total = items + pers + ship;
    if (advanceModel) return { items, pers, ship, total, deposit: advance, now: advance, later: total - advance };
    const goods = items + pers;
    let deposit = total;
    if (cfg.paymentMode === "DEPOSIT") deposit = cfg.depositType === "FIXED" ? Math.min(cfg.depositValue, total) : Math.min(total, Math.round((goods * cfg.depositValue) / 100));
    const now = payKind === "FULL" ? total : deposit;
    return { items, pers, ship, total, deposit, now, later: total - now };
  }, [lines, byId, delivery, cfg, payKind, advanceModel]);

  const depositLabel = cfg.depositType === "PERCENT" ? `Seña (${cfg.depositValue} %)` : "Seña";
  const nowLabel = advanceModel ? "Anticipo ahora (Mercado Pago)" : "A pagar ahora";
  const laterLabel = advanceModel ? `Saldo a pagar al club` : "Saldo pendiente";

  function addLine(l: Omit<Line, "id">, newPlayer?: Player) {
    if (newPlayer) setPlayers((ps) => [...ps, newPlayer]);
    setLines((ls) => [...ls, { ...l, id: uid() }]);
    setToast(`${l.quantity > 1 ? `${l.quantity} unidades agregadas` : "Agregado al pedido"}: ${byId.get(l.productId)?.name ?? ""}`);
  }

  function validate(): string | null {
    if (!lines.length) return "Agregá al menos una prenda.";
    if (buyer.name.trim().length < 3) return "Completá tu nombre y apellido.";
    if (!/^\S+@\S+\.\S+$/.test(buyer.email.trim())) return "Revisá el correo: ahí te enviamos el enlace del pedido.";
    if (buyer.phone.replace(/\D/g, "").length < 8) return "Completá un celular con código de área.";
    if (cfg.memberNumberMode === "REQUIRED" && !buyer.memberNumber.trim()) return "Completá tu número de socio.";
    if (delivery === "SHIPPING" && address.trim().length < 6) return "Completá la dirección de envío.";
    if (anyNoChange && !policyOk) return "Confirmá que leíste la política de cambios de prendas personalizadas.";
    if (!terms) return "Para continuar, aceptá las condiciones de la preventa.";
    if (!cfg.mercadopago && !cfg.transfer) return "No hay medios de pago habilitados. Escribí al club.";
    return null;
  }

  async function submit() {
    setSending(true);
    setFormError(null);
    try {
      const usedPlayers = players.filter((p) => lines.some((l) => l.playerKey === p.key));
      const res = await fetch(`/api/campanas/${cfg.campaignId}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idem.current,
          players: usedPlayers.map((p) => ({ key: p.key, name: p.name, sport: p.sport || undefined, category: p.category || undefined, team: p.team || undefined })),
          items: lines.map((l) => ({ productId: l.productId, playerKey: l.playerKey, sizes: l.sizes, options: l.options, quantity: l.quantity })),
          buyer: { name: buyer.name, email: buyer.email, phone: buyer.phone, memberNumber: buyer.memberNumber || undefined },
          delivery: { method: delivery, address: delivery === "SHIPPING" ? address : undefined },
          notes: notes || undefined,
          acceptTerms: terms,
          payMethod,
          payKind,
          policyVersion: anyNoChange && policyOk ? CHANGE_POLICY_VERSION : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.redirect) {
        setFormError(body.error ?? "No pudimos registrar el pedido. Intentá de nuevo.");
        setReview(false);
        return;
      }
      window.location.assign(body.redirect);
    } catch {
      setFormError("Sin conexión. Revisá tu internet y volvé a intentar: no se duplicará el pedido.");
    } finally {
      setSending(false);
    }
  }

  const groups = [
    ...players.map((p) => ({ player: p as Player | null, lines: lines.filter((l) => l.playerKey === p.key) })),
    { player: null, lines: lines.filter((l) => !l.playerKey) },
  ].filter((g) => g.lines.length);

  const Totals = ({ big }: { big?: boolean }) => (
    <dl className="num grid gap-1.5">
      <div className="flex justify-between"><dt>Prendas ({units})</dt><dd>{ars(totals.items)}</dd></div>
      <div className="flex justify-between"><dt>Personalización y adicionales</dt><dd>{ars(totals.pers)}</dd></div>
      {!advanceModel && <div className="flex justify-between"><dt>Envío</dt><dd>{totals.ship ? ars(totals.ship) : "Sin costo"}</dd></div>}
      <div className={`mt-1 flex justify-between border-t-2 border-ink pt-2 font-bold ${big ? "text-lg" : ""}`}><dt>Total</dt><dd>{ars(totals.total)}</dd></div>
      <div className={`flex justify-between rounded-lg bg-club-2 px-3 py-2 font-bold text-on-club-2 ${big ? "text-lg" : ""}`}>
        <dt>{advanceModel ? nowLabel : review ? `${payKind === "FULL" ? "Pago total" : depositLabel} · ${payMethod === "MERCADOPAGO" ? "Mercado Pago" : "Transferencia"}` : nowLabel}</dt>
        <dd>{ars(totals.now)}</dd>
      </div>
      {advanceModel && <div className="-mt-1 px-3 text-xs text-muted">Lo cobra la textil que fabrica las prendas.</div>}
      {totals.later > 0 && (
        <div className="flex justify-between text-muted">
          <dt>{laterLabel}{!advanceModel && totals.ship ? " (incluye envío)" : ""}</dt>
          <dd>{ars(totals.later)}</dd>
        </div>
      )}
      {advanceModel && totals.later > 0 && <div className="-mt-1 text-xs text-muted">Lo cobra {cfg.clubName} directamente, antes del retiro.</div>}
      {advanceModel && totals.later === 0 && lines.length > 0 && <div className="text-xs text-muted">Sin saldo a pagar al club.</div>}
    </dl>
  );

  return (
    <>
      <section id="coleccion" className="mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">{cfg.open ? "Precios de preventa" : "Colección"}</div>
            <h2 className="mt-1 text-4xl font-extrabold">La colección</h2>
          </div>
          <p className="max-w-[44ch] text-sm text-muted">
            Cada foto indica si es una foto real, un diseño o una referencia.{cfg.audience !== "ALL" ? ` Preventa para ${cfg.audienceText}.` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {products.map((p) => {
            const img = p.images[0];
            const soldOut = p.remaining === 0;
            return (
              <article key={p.id} className="card flex min-w-0 flex-col overflow-hidden">
                <div className="relative aspect-square bg-surface-2">
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.url} alt={img.alt ?? p.name} className="h-full w-full object-cover" loading="lazy" />
                  )}
                  {img && <span className="tag-photo">{TAG_LABEL[img.tag]}</span>}
                  {p.kind !== "SIMPLE" && <span className="badge badge-info absolute bottom-2 left-2">{p.kind === "SET" ? "Conjunto" : "Combo"}</span>}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3 md:p-4">
                  <div className="font-mono text-xs text-muted">{p.code}</div>
                  <h3 className="text-xl font-bold md:text-2xl">{p.name}</h3>
                  <p className="hidden text-sm text-muted md:block">{p.description}</p>
                  <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-2">
                    <span className="font-display text-2xl font-bold md:text-3xl">{ars(p.price)}</span>
                    {p.listPrice && <s className="text-sm text-muted">{ars(p.listPrice)}</s>}
                  </div>
                  {advanceModel && p.textilPrice != null && (
                    <p className="text-xs text-muted">
                      Anticipo {ars(p.textilPrice)}{p.price > p.textilPrice ? ` · saldo al club ${ars(p.price - p.textilPrice)}` : ""}
                    </p>
                  )}
                  {p.samples.length > 0 && <p className="text-xs font-semibold">Muestrario disponible en el club</p>}
                  {p.remaining != null && <p className="text-xs text-muted">{soldOut ? "Sin cupo disponible" : `Cupo disponible: ${p.remaining}`}</p>}
                  {cfg.open ? (
                    <button className="btn btn-club mt-2 w-full" onClick={() => setSheet(p)} disabled={soldOut}>
                      {soldOut ? "Sin cupo" : "Configurar"}
                    </button>
                  ) : (
                    <button className="btn btn-ghost mt-2 w-full" onClick={() => setSheet(p)}>
                      Ver ficha
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {cfg.open && (
        <section id="pedido" className="mt-14 scroll-mt-4">
          <div className="eyebrow">Tu pedido</div>
          <h2 className="mb-5 mt-1 text-4xl font-extrabold">Carrito por jugador</h2>
          <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="card min-w-0 p-4 md:p-5">
              {!lines.length && <p className="py-6 text-center text-muted">Todavía no agregaste prendas. Elegí un producto de la colección.</p>}
              {groups.map((g, gi) => (
                <div key={g.player?.key ?? "none"} className={gi ? "mt-4 border-t border-line pt-4" : ""}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <b className="font-display text-xl uppercase">{g.player ? g.player.name : "Sin jugador asociado"}</b>
                    <span className="text-sm text-muted">{g.player ? [g.player.sport, g.player.category, g.player.team].filter(Boolean).join(" · ") : "Socio o hincha"}</span>
                  </div>
                  {g.lines.map((l) => {
                    const p = byId.get(l.productId)!;
                    const lp = linePrice(p, l);
                    return (
                      <div key={l.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b border-dashed border-line py-3 last:border-0">
                        <div className="min-w-0">
                          <div className="font-bold">{p.name}</div>
                          <div className="text-sm text-muted">
                            {p.components.map((c) => (
                              <span key={c.label} className="mr-2 inline-block">
                                {p.components.length > 1 ? c.label : "Talle"} <b className="text-ink">{l.sizes[c.label]}</b>
                              </span>
                            ))}
                          </div>
                          {lp.opts.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {lp.opts.map((o) => <span key={o.g.id} className="rounded bg-surface-2 px-2 font-mono text-xs">{o.g.name}: {o.label}</span>)}
                            </div>
                          )}
                          {lp.noSizeChange && <div className="mt-1 text-xs font-semibold">Sin cambio de talle (personalizada)</div>}
                        </div>
                        <div className="text-right">
                          <div className="num font-bold">{ars(lp.total)}</div>
                          {advanceModel && <div className="num text-xs text-muted">anticipo {ars(lp.advance)}</div>}
                          <div className="mt-1 flex items-center justify-end gap-1">
                            {!lp.freeText && (
                              <>
                                <button className="btn btn-ghost btn-sm w-9 px-0" aria-label="Restar una" onClick={() => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}>−</button>
                                <span className="num w-6 text-center font-semibold">{l.quantity}</span>
                                <button className="btn btn-ghost btn-sm w-9 px-0" aria-label="Sumar una" onClick={() => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, quantity: Math.min(30, x.quantity + 1) } : x)))}>+</button>
                              </>
                            )}
                            <button className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} aria-label={`Quitar ${p.name}`}>Quitar</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <form
              className="card grid min-w-0 gap-4 p-4 md:p-5"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const err = validate();
                setFormError(err);
                if (!err) setReview(true);
              }}
            >
              <h3 className="text-2xl font-bold">Datos y pago</h3>
              <div className="field">
                <label htmlFor="bName">Nombre y apellido</label>
                <input id="bName" className="input" autoComplete="name" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="field">
                  <label htmlFor="bEmail">Correo</label>
                  <input id="bEmail" type="email" className="input" autoComplete="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="bPhone">Celular</label>
                  <input id="bPhone" type="tel" className="input" autoComplete="tel" placeholder="11 5555 5555" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />
                </div>
              </div>
              {cfg.memberNumberMode !== "HIDDEN" && (
                <div className="field">
                  <label htmlFor="bMember">
                    N.º de socio {cfg.memberNumberMode === "OPTIONAL" && <small>(opcional)</small>}
                  </label>
                  <input id="bMember" className="input" inputMode="numeric" value={buyer.memberNumber} onChange={(e) => setBuyer({ ...buyer, memberNumber: e.target.value })} />
                  <small>Es un dato declarado: el club lo puede verificar al entregar.</small>
                </div>
              )}

              {advanceModel ? (
                <div className="grid gap-1 rounded-lg border-[1.5px] border-line p-3">
                  <span className="label">Entrega</span>
                  <b>Retiro en el club</b>
                  <span className="text-sm text-muted">
                    La producción completa se entrega en {cfg.clubName}. Te avisamos cuando tus prendas estén disponibles.{cfg.pickupText ? ` ${cfg.pickupText}` : ""}
                  </span>
                </div>
              ) : (
                <fieldset className="grid gap-2">
                  <legend className="label mb-1">Entrega</legend>
                  {cfg.pickupEnabled && (
                    <label className="flex cursor-pointer gap-3 rounded-lg border-[1.5px] border-line p-3 has-[:checked]:border-club">
                      <input type="radio" name="dl" className="mt-1 accent-[var(--club)]" checked={delivery === "PICKUP"} onChange={() => setDelivery("PICKUP")} />
                      <span>
                        <b>Retiro en sede</b> · sin costo
                        {cfg.pickupText && <span className="block text-sm text-muted">{cfg.pickupText}</span>}
                      </span>
                    </label>
                  )}
                  {cfg.shippingEnabled && (
                    <label className="flex cursor-pointer gap-3 rounded-lg border-[1.5px] border-line p-3 has-[:checked]:border-club">
                      <input type="radio" name="dl" className="mt-1 accent-[var(--club)]" checked={delivery === "SHIPPING"} onChange={() => setDelivery("SHIPPING")} />
                      <span>
                        <b>Envío a domicilio</b> · {ars(cfg.shippingPrice)}
                        {cfg.shippingNotes && <span className="block text-sm text-muted">{cfg.shippingNotes}</span>}
                      </span>
                    </label>
                  )}
                </fieldset>
              )}
              {delivery === "SHIPPING" && (
                <div className="field">
                  <label htmlFor="bAddr">Dirección de envío</label>
                  <input id="bAddr" className="input" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              )}
              <div className="field">
                <label htmlFor="bNotes">Observaciones <small>(opcional)</small></label>
                <textarea id="bNotes" className="input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {!advanceModel && cfg.paymentMode === "DEPOSIT" && (
                <fieldset className="grid gap-2">
                  <legend className="label mb-1">¿Cuánto pagás ahora?</legend>
                  <label className="flex cursor-pointer gap-3 rounded-lg border-[1.5px] border-line p-3 has-[:checked]:border-club">
                    <input type="radio" name="pk" className="mt-1 accent-[var(--club)]" checked={payKind === "DEPOSIT"} onChange={() => setPayKind("DEPOSIT")} />
                    <span><b>{depositLabel}</b> y el saldo al retirar</span>
                  </label>
                  <label className="flex cursor-pointer gap-3 rounded-lg border-[1.5px] border-line p-3 has-[:checked]:border-club">
                    <input type="radio" name="pk" className="mt-1 accent-[var(--club)]" checked={payKind === "FULL"} onChange={() => setPayKind("FULL")} />
                    <span><b>El total</b> ahora</span>
                  </label>
                </fieldset>
              )}

              <fieldset className="grid gap-2">
                <legend className="label mb-1">{advanceModel ? "Pago del anticipo" : "Medio de pago"}</legend>
                {cfg.mercadopago && (
                  <label className="flex cursor-pointer gap-3 rounded-lg border-[1.5px] border-line p-3 has-[:checked]:border-club">
                    <input type="radio" name="pm" className="mt-1 accent-[var(--club)]" checked={payMethod === "MERCADOPAGO"} onChange={() => setPayMethod("MERCADOPAGO")} />
                    <span>
                      <b>Mercado Pago</b>
                      <span className="block text-sm text-muted">{cfg.simulated ? "Entorno de prueba: el pago es simulado y no mueve dinero. " : ""}{MP_FINANCING_TEXT}</span>
                    </span>
                  </label>
                )}
                {cfg.transfer && (
                  <label className="flex cursor-pointer gap-3 rounded-lg border-[1.5px] border-line p-3 has-[:checked]:border-club">
                    <input type="radio" name="pm" className="mt-1 accent-[var(--club)]" checked={payMethod === "TRANSFER"} onChange={() => setPayMethod("TRANSFER")} />
                    <span>
                      <b>Transferencia bancaria</b>
                      <span className="block text-sm text-muted">Te mostramos los datos y subís el comprobante. Queda en revisión hasta que se aprueba.</span>
                    </span>
                  </label>
                )}
                <p className="text-xs text-muted">
                  {advanceModel ? `El anticipo lo cobra ${cfg.receiver}. El saldo, si corresponde, se paga a ${cfg.clubName}.` : `Destinatario de los pagos: ${cfg.receiver}.`}
                </p>
              </fieldset>

              {lines.length > 0 && <Totals big />}

              {anyNoChange && (
                <label className="flex items-start gap-3 rounded-lg border-[1.5px] border-club p-3 text-sm">
                  <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--club)]" checked={policyOk} onChange={(e) => setPolicyOk(e.target.checked)} />
                  <span><b>Política de cambios.</b> {CHANGE_POLICY_TEXT}</span>
                </label>
              )}
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-[var(--club)]" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                <span>
                  Leí y acepto las <a href={cfg.policiesAnchor} className="underline">condiciones de la preventa</a> y el uso de mis datos solo para gestionar este pedido.
                </span>
              </label>
              {formError && <p role="alert" className="notice notice-danger">{formError}</p>}
              <button type="submit" className="btn btn-club w-full">Revisar pedido</button>
            </form>
          </div>
        </section>
      )}

      {cfg.open && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-ink px-4 pt-2.5 text-paper" style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div>
              <div className="text-sm opacity-80">{units ? `${units} ${units === 1 ? "prenda" : "prendas"} · ${advanceModel ? "anticipo" : "ahora"} ${ars(totals.now)}` : "Tu pedido está vacío"}</div>
              <b className="num font-display text-2xl">{ars(totals.total)}</b>
            </div>
            <a href="#pedido" className="btn btn-accent">Ver pedido</a>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-[35] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-lg bg-club px-4 py-2.5 font-semibold text-on-club">
          {toast}
        </div>
      )}

      {sheet && <ProductSheet p={sheet} cfg={cfg} players={players} canBuy={cfg.open && sheet.remaining !== 0} onClose={() => setSheet(null)} onAdd={(l, np) => { addLine(l, np); setSheet(null); }} />}

      {review && (
        <Modal onClose={() => !sending && setReview(false)} title="Revisá nombres, números y talles">
          <p className="text-muted">Esto es lo que se envía a fabricar. Después del cierre no se puede cambiar.</p>
          {groups.map((g) => (
            <div key={g.player?.key ?? "none"} className="mt-4">
              <div className="flex justify-between font-display text-lg font-bold uppercase">
                <span>{g.player?.name ?? "Sin jugador"}</span>
                <span className="font-sans text-sm font-normal normal-case text-muted">{g.player ? [g.player.sport, g.player.category, g.player.team].filter(Boolean).join(" · ") : "Socio o hincha"}</span>
              </div>
              {g.lines.map((l) => {
                const p = byId.get(l.productId)!;
                const lp = linePrice(p, l);
                return (
                  <div key={l.id} className="mt-2 rounded-lg border border-line p-3">
                    <b>{l.quantity > 1 ? `${l.quantity} × ` : ""}{p.name}</b>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 text-sm">
                      {p.components.map((c) => (
                        <div key={c.label} className="contents"><dt className="text-muted">Talle {c.label.toLowerCase()}</dt><dd className="font-semibold">{l.sizes[c.label]}</dd></div>
                      ))}
                      {lp.opts.map((o) => (
                        <div key={o.g.id} className="contents"><dt className="text-muted">{o.g.name}</dt><dd className="font-semibold">{o.label}</dd></div>
                      ))}
                    </dl>
                    {lp.noSizeChange && <p className="mt-1 text-xs font-semibold">Personalizada: no admite cambio de talle.</p>}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="mt-5"><Totals /></div>
          {anyNoChange && <p className="notice notice-info mt-3 text-sm">{CHANGE_POLICY_TEXT}</p>}
          {payMethod === "MERCADOPAGO" && <p className="mt-3 text-xs text-muted">{MP_FINANCING_TEXT}</p>}
          <p className="mt-1 text-xs text-muted">El importe final lo calcula el sistema con los precios vigentes al confirmar.</p>
          <div className="mt-5 grid gap-2">
            <button className="btn btn-club w-full" disabled={sending} onClick={submit}>
              {sending ? "Registrando pedido…" : payMethod === "MERCADOPAGO" ? (advanceModel ? "Confirmar y pagar el anticipo" : "Confirmar e ir a pagar") : "Confirmar y ver datos de transferencia"}
            </button>
            <button className="btn btn-ghost w-full" disabled={sending} onClick={() => setReview(false)}>Volver a editar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 md:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-surface p-4 md:rounded-2xl md:p-6" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="mb-3 flex items-start gap-3">
          <h3 className="text-3xl font-extrabold">{title}</h3>
          <button className="ml-auto grid h-10 w-10 flex-none place-items-center rounded-full bg-surface-2 text-xl" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SizeChart({ c }: { c: StoreComponent }) {
  const hasMeasures = c.sizes.some((s) => s.a != null || s.b != null);
  if (!hasMeasures) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-semibold underline">Tabla de medidas · {c.label.toLowerCase()}</summary>
      <div className="tbl-wrap mt-2 rounded-lg border border-line">
        <table className="tbl">
          <thead><tr><th>Talle</th><th>{c.measureA} ({c.unit})</th><th>{c.measureB} ({c.unit})</th></tr></thead>
          <tbody>
            {c.sizes.map((s) => (
              <tr key={s.label}><td className="font-bold">{s.label}</td><td>{s.a ?? "—"}</td><td>{s.b ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.note && <p className="mt-1 text-xs text-muted">{c.note}</p>}
    </details>
  );
}

const Step = ({ n, title, aside }: { n: number; title: string; aside?: string }) => (
  <div className="mb-2 flex items-baseline justify-between gap-2">
    <span className="font-display text-lg font-bold uppercase">
      <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-club text-sm text-on-club">{n}</span>
      {title}
    </span>
    {aside && <span className="text-sm text-muted">{aside}</span>}
  </div>
);

function ProductSheet({ p, cfg, players, canBuy, onClose, onAdd }: { p: StoreProduct; cfg: StoreConfig; players: Player[]; canBuy: boolean; onClose: () => void; onAdd: (l: Omit<Line, "id">, np?: Player) => void }) {
  const advanceModel = cfg.model === "TEXTIL_ADVANCE";
  const needsPlayer = cfg.audience !== "ALL";
  const allowedSports = cfg.audience === "SPORTS" ? cfg.sports : cfg.audience === "CATEGORIES" ? [...new Set(cfg.categories.map((c) => c.sport).filter(Boolean) as string[])] : cfg.sports;
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [player, setPlayer] = useState<string>(players[0]?.key ?? "__new");
  const [np, setNp] = useState({ name: "", sport: allowedSports[0] ?? "", category: "", team: "" });
  const [sel, setSel] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const groups = sortGroups(p.optionGroups);
  const visible = groups.filter((g) => isVisible(g, sel));
  const cats = cfg.categories.filter((c) => !np.sport || !c.sport || c.sport === np.sport);
  const draft: Line = { id: "draft", productId: p.id, playerKey: null, sizes, options: cleanSelections(groups, sel), quantity: 1 };
  const lp = linePrice(p, draft);
  const single = lp.freeText;
  const q = single ? 1 : qty;
  let step = 1;

  function add() {
    const missing = p.components.filter((c) => !sizes[c.label]).map((c) => c.label.toLowerCase());
    if (missing.length) return setErr(`Elegí el talle de: ${missing.join(" y ")}.`);
    let newPlayer: Player | undefined;
    let key: string | null = player === "__none" ? null : player;
    if (needsPlayer && !key) return setErr(`Esta preventa es para ${cfg.audienceText}: elegí o agregá el jugador.`);
    if (player === "__new") {
      if (np.name.trim().length < 2) return setErr("Escribí el nombre del jugador.");
      if (needsPlayer && !np.category && cfg.audience === "CATEGORIES") return setErr("Elegí la categoría del jugador.");
      newPlayer = { key: `p${Date.now()}`, name: np.name.trim(), sport: np.sport, category: np.category, team: np.team.trim() };
      key = newPlayer.key;
    }
    for (const g of visible) {
      const v = sel[g.id]?.trim();
      if (!v) {
        if (g.required) return setErr(`Completá "${g.name}".`);
        continue;
      }
      if (g.type === "TEXT") {
        const max = g.maxLength ?? 20;
        if (v.length > max) return setErr(`"${g.name}" admite hasta ${max} caracteres.`);
        if (g.role === "NAME" && !NAME_RE.test(v.toUpperCase())) return setErr(`"${g.name}" solo admite letras, espacios, punto, guion y apóstrofo.`);
      }
      if (g.type === "NUMBER" && (!/^\d{1,3}$/.test(v) || +v < (g.numberMin ?? 0) || +v > (g.numberMax ?? 99)))
        return setErr(`"${g.name}" debe estar entre ${g.numberMin ?? 0} y ${g.numberMax ?? 99}.`);
    }
    if (p.remaining != null && q > p.remaining) return setErr(`Cupo disponible: ${p.remaining}.`);
    const options = cleanSelections(groups, sel);
    for (const g of groups) if (g.role === "NAME" && options[g.id]) options[g.id] = options[g.id].toUpperCase();
    onAdd({ productId: p.id, playerKey: key, sizes, options, quantity: q }, newPlayer);
  }

  const image = p.images[img];
  return (
    <Modal title={p.name} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt={image.alt ?? p.name} className="h-full w-full object-cover" />
            )}
            {image && <span className="tag-photo">{TAG_LABEL[image.tag]}</span>}
          </div>
          {p.images.length > 1 && (
            <div className="mt-2 flex gap-2">
              {p.images.map((im, i) => (
                <button key={im.url + i} onClick={() => setImg(i)} aria-label={`Ver imagen ${i + 1}`} aria-pressed={i === img} className={`h-14 w-14 overflow-hidden rounded border-2 ${i === img ? "border-club" : "border-line"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted">{p.code}</div>
          <p className="mt-1 text-muted">{p.description}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold">{ars(p.price)}</span>
            {p.listPrice && <s className="text-muted">{ars(p.listPrice)}</s>}
          </div>
          {advanceModel && p.textilPrice != null && (
            <p className="text-sm text-muted">Anticipo {ars(p.textilPrice)} por Mercado Pago{p.price > p.textilPrice ? ` · saldo ${ars(p.price - p.textilPrice)} al club` : ""}</p>
          )}
          {p.components.map((c) => (
            <p key={c.label} className="mt-1 text-xs text-muted">
              {p.components.length > 1 && <b>{c.label}: </b>}
              {[c.material, c.care].filter(Boolean).join(" ")}
            </p>
          ))}
          {p.manufacturingTerms && <p className="mt-1 text-xs text-muted">{p.manufacturingTerms}</p>}
          {groups.some((g) => g.blocksSizeChange) && <p className="mt-2 text-xs"><b>Cambios:</b> {CHANGE_POLICY_TEXT}</p>}
        </div>
      </div>

      {p.samples.length > 0 && (
        <div className="notice notice-info mt-4 text-sm">
          <b>{SAMPLE_TEXT}</b>
          {p.samples.map((s, i) => (
            <span key={i} className="block">
              Talles del muestrario: {s.sizes.join(", ")}{s.location ? ` · ${s.location}` : ""}
            </span>
          ))}
        </div>
      )}

      {p.components.map((c) => (
        <div key={c.label} className="mt-5">
          <Step n={step++} title={`Talle${p.components.length > 1 ? ` · ${c.label}` : ""}`} aside={`${c.garmentName}${c.variant ? ` · ${c.variant}` : ""}`} />
          {groupSizes(c.sizes).map(([g, list]) => (
            <div key={g} className="mb-2">
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{GROUP_LABEL[g] ?? g}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((s) => (
                  <button key={s.label} type="button" className="chip-size num" aria-pressed={sizes[c.label] === s.label} disabled={!canBuy} onClick={() => setSizes({ ...sizes, [c.label]: s.label })}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <SizeChart c={c} />
        </div>
      ))}

      {canBuy && (
        <>
          <div className="mt-5">
            <Step n={step++} title="Jugador" aside={needsPlayer ? `Para ${cfg.audienceText}` : undefined} />
            <select className="input" value={player} onChange={(e) => setPlayer(e.target.value)} aria-label="Jugador">
              {players.map((pl) => (
                <option key={pl.key} value={pl.key}>{pl.name}{pl.category ? ` · ${pl.category}` : ""}</option>
              ))}
              <option value="__new">+ Agregar jugador</option>
              {!needsPlayer && <option value="__none">Sin jugador (socio o hincha)</option>}
            </select>
            {player === "__new" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="field sm:col-span-2"><label htmlFor="npName">Nombre del jugador</label><input id="npName" className="input" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} /></div>
                <div className="field">
                  <label htmlFor="npSport">Disciplina</label>
                  <select id="npSport" className="input" value={np.sport} onChange={(e) => setNp({ ...np, sport: e.target.value, category: "" })}>
                    {allowedSports.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="npCat">Categoría o división</label>
                  <select id="npCat" className="input" value={np.category} onChange={(e) => setNp({ ...np, category: e.target.value })}>
                    <option value="">Elegir</option>
                    {cats.map((c) => <option key={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field sm:col-span-2"><label htmlFor="npTeam">Equipo <small>(opcional)</small></label><input id="npTeam" className="input" placeholder="Ej.: B" value={np.team} onChange={(e) => setNp({ ...np, team: e.target.value })} /></div>
              </div>
            )}
          </div>

          {visible.length > 0 && (
            <div className="mt-5">
              <Step n={step++} title="Personalización" aside="Por unidad" />
              <div className="grid gap-3 sm:grid-cols-2">
                {visible.map((g) => {
                  const price = g.priceTextil + g.priceClub;
                  return (
                    <div key={g.id} className={`field ${g.type === "CHOICE" ? "sm:col-span-2" : ""}`}>
                      <label htmlFor={`og-${g.id}`}>
                        {g.name} {!g.required && <small>(opcional)</small>}
                        {g.type !== "CHOICE" && price > 0 && <small> + {ars(price)}</small>}
                        {g.type === "TEXT" && <small> · hasta {g.maxLength ?? 20}</small>}
                        {g.type === "NUMBER" && <small> · {g.numberMin ?? 0} a {g.numberMax ?? 99}</small>}
                      </label>
                      {g.type === "CHOICE" ? (
                        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={g.name}>
                          {!g.required && (
                            <button type="button" className="chip-size" aria-pressed={!sel[g.id]} onClick={() => setSel({ ...sel, [g.id]: "" })}>Sin {g.name.toLowerCase()}</button>
                          )}
                          {g.values.map((v) => (
                            <button key={v.id} type="button" className="chip-size" aria-pressed={sel[g.id] === v.id} onClick={() => setSel({ ...sel, [g.id]: v.id })}>
                              {v.label}{v.priceTextil + v.priceClub > 0 ? ` +${ars(v.priceTextil + v.priceClub)}` : ""}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          id={`og-${g.id}`}
                          className={`input ${g.role === "NAME" ? "uppercase" : ""}`}
                          inputMode={g.type === "NUMBER" ? "numeric" : undefined}
                          maxLength={g.type === "NUMBER" ? 3 : (g.maxLength ?? 20)}
                          value={sel[g.id] ?? ""}
                          onChange={(e) => setSel({ ...sel, [g.id]: g.type === "NUMBER" ? e.target.value.replace(/\D/g, "") : g.role === "NAME" ? e.target.value.toUpperCase() : e.target.value })}
                        />
                      )}
                      {g.help && <small>{g.help}</small>}
                    </div>
                  );
                })}
              </div>
              {lp.noSizeChange && <p className="notice notice-info mt-3 text-sm"><b>Atención:</b> {CHANGE_POLICY_TEXT}</p>}
              {!lp.noSizeChange && groups.some((g) => g.blocksSizeChange) && <p className="mt-2 text-xs text-muted">{CHANGE_POLICY_UNPERSONALIZED}</p>}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Step n={step++} title="Cantidad" />
              {single && <small className="text-muted">Las prendas con nombre o número se agregan de a una.</small>}
            </div>
            <div className="inline-flex items-center overflow-hidden rounded-lg border-[1.5px] border-line">
              <button type="button" className="h-11 w-11 bg-surface-2 text-xl" aria-label="Restar" onClick={() => setQty(Math.max(1, qty - 1))} disabled={single}>−</button>
              <output className="num w-12 text-center font-bold">{q}</output>
              <button type="button" className="h-11 w-11 bg-surface-2 text-xl" aria-label="Sumar" onClick={() => setQty(Math.min(30, qty + 1))} disabled={single}>+</button>
            </div>
          </div>

          <div className="mt-5 rounded-lg bg-surface-2 p-3">
            <Step n={step++} title="Resumen" />
            <dl className="num grid gap-1 text-sm">
              <div className="flex justify-between"><dt>Precio por unidad</dt><dd>{ars(lp.unit)}</dd></div>
              <div className="flex justify-between font-bold"><dt>Total ({q})</dt><dd>{ars(lp.unit * q)}</dd></div>
              {advanceModel && (
                <>
                  <div className="flex justify-between"><dt>Anticipo ahora (Mercado Pago)</dt><dd>{ars(lp.advance * q)}</dd></div>
                  <div className="flex justify-between"><dt>Saldo al club</dt><dd>{ars(lp.club * q)}</dd></div>
                </>
              )}
            </dl>
          </div>
          {err && <p role="alert" className="notice notice-danger mt-4">{err}</p>}
          <button className="btn btn-club mt-5 w-full" onClick={add}>Agregar al pedido</button>
        </>
      )}
      {!canBuy && <p className="notice notice-info mt-5">{cfg.open ? "Sin cupo disponible para este producto." : "La ventana de compra está cerrada."}</p>}
    </Modal>
  );
}
