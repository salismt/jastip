// Prototype and test controls. Every action answers 404 unless PROTOTYPE_MODE=1.
import { connection } from "next/server";
import { prototypeMode } from "@/lib/env";
import { fake } from "@/lib/midtrans";
import { MemoryStore, setStore, store } from "@/lib/orders/store";

const notFound = () => new Response("Not found", { status: 404 });

async function seed(scenario: string) {
  const s = new MemoryStore();
  const paid = (id: string, item_id: string, qty: number, amount: number, name: string) =>
    s.orders.set(id, {
      id, item_id, qty, amount, buyer_name: name, buyer_wa: "081200000000",
      state: "paid", snap_token: null, paid_at: new Date(), created_at: new Date(),
    });
  ["Ayu", "Dimas", "Putri", "Bagus", "Sari", "Joko"].forEach((n, i) => paid(`SEED-CM-${i + 1}`, "coklat-matcha", 1, 9500, n));
  if (scenario === "kue-pisang-full") paid("SEED-KP-1", "kue-pisang", 10, 185000, "Rombongan");
  setStore(s);
  const f = fake();
  f.requests.length = 0;
  f.statuses.clear();
  f.failNext = false;
}

export async function POST(req: Request, ctx: RouteContext<"/api/prototype/[action]">) {
  if (!prototypeMode()) return notFound();
  const { action } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  switch (action) {
    case "reset":
      await seed(body.scenario ?? "default");
      return Response.json({ ok: true });
    case "status":
      fake().statuses.set(body.order_id, { found: true, transaction_id: "fake-tx-" + body.order_id, payment_type: "qris", ...body });
      return Response.json({ ok: true });
    case "fail-next":
      fake().failNext = true;
      return Response.json({ ok: true });
  }
  return notFound();
}

export async function GET(req: Request, ctx: RouteContext<"/api/prototype/[action]">) {
  await connection();
  if (!prototypeMode()) return notFound();
  const { action } = await ctx.params;
  const q = new URL(req.url).searchParams;
  switch (action) {
    case "order":
      return Response.json(await store().get(q.get("id") ?? ""));
    case "orders":
      return Response.json([...((store() as MemoryStore).orders?.values() ?? [])]);
    case "snap-requests":
      return Response.json(fake().requests);
    case "snap.js":
      return new Response(FAKE_SNAP_JS, { headers: { "Content-Type": "text/javascript" } });
  }
  return notFound();
}

// A stand-in for Midtrans snap.js: shows which methods the server asked Snap for, then closes.
const FAKE_SNAP_JS = `
window.snap = {
  pay: async function (token, cb) {
    var reqs = await fetch('/api/prototype/snap-requests').then(function (r) { return r.json(); });
    var n = Number(String(token).split('-').pop());
    var body = reqs[n - 1] || {};
    var labels = { other_qris: 'QRIS', gopay: 'GoPay', credit_card: 'Kartu kredit', bank_transfer: 'Transfer bank' };
    var d = document.createElement('div');
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Midtrans Snap (prototype)');
    d.style.cssText = 'position:fixed;inset:0;background:rgba(42,33,27,.55);display:flex;align-items:flex-end;justify-content:center;z-index:50;font-family:inherit';
    var amount = body.transaction_details ? body.transaction_details.gross_amount : 0;
    d.innerHTML = '<div style="background:#fff;width:100%;max-width:28rem;border-radius:20px 20px 0 0;padding:20px">' +
      '<div style="display:flex;justify-content:space-between;font-weight:700"><span>Midtrans Snap</span><span style="font-size:11px;background:#2a211b;color:#fcd34d;padding:2px 8px;border-radius:6px">PROTOTYPE</span></div>' +
      '<p style="margin:8px 0 0;color:#7b6d60;font-size:13px">' + (body.transaction_details ? body.transaction_details.order_id : '') + '</p>' +
      '<p style="margin:4px 0 12px;font-size:22px;font-weight:700">Rp' + Number(amount).toLocaleString('id-ID') + '</p>' +
      '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:8px">' +
      (body.enabled_payments || []).map(function (p) { return '<li style="border:1px solid #eadfcd;border-radius:12px;padding:10px 12px">' + (labels[p] || p) + '</li>'; }).join('') +
      '</ul><button type="button" style="margin-top:14px;width:100%;padding:12px;border-radius:12px;background:#c4432b;color:#fff;font-weight:600;border:0">Tutup</button></div>';
    document.body.appendChild(d);
    d.querySelector('button').onclick = function () { d.remove(); cb && cb.onClose && cb.onClose(); };
  }
};`;
