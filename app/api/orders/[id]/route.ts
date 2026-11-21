import { connection } from "next/server";
import { getItem } from "@/lib/catalog";
import { store } from "@/lib/orders/store";

export type OrderView = {
  id: string;
  item_id: string;
  item_name: string;
  qty: number;
  buyer_name: string;
  wa_masked: string;
  amount: number;
  state: string;
  paid_at: string | null;
  evidence: { source: string; transaction_status: string | null; signature_ok: boolean | null; received_at: string }[];
};

// Anyone with the order id can open this page, so the WhatsApp number is masked.
const mask = (wa: string) => wa.slice(0, 4) + "****" + wa.slice(-3);

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  // Always read live state: Next cannot see the database read, so without this it may serve a cached response.
  await connection();
  const { id } = await ctx.params;
  const db = store();
  const o = await db.get(id);
  if (!o) return Response.json({ error: "not_found" }, { status: 404 });
  const events = await db.events(id);
  const view: OrderView = {
    id: o.id,
    item_id: o.item_id,
    item_name: getItem(o.item_id)?.name ?? o.item_id,
    qty: o.qty,
    buyer_name: o.buyer_name,
    wa_masked: mask(o.buyer_wa),
    amount: o.amount,
    state: o.state,
    paid_at: o.paid_at ? new Date(o.paid_at).toISOString() : null,
    evidence: events.map((e) => ({
      source: e.source,
      transaction_status: e.transaction_status,
      signature_ok: e.signature_ok,
      received_at: new Date(e.received_at).toISOString(),
    })),
  };
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
