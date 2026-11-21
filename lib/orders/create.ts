import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getItem, MAX_QTY } from "../catalog";
import { createSnapToken } from "../midtrans";
import { log } from "../log";
import { store } from "./store";

export const orderInput = z.object({
  itemId: z.string(),
  name: z.string().trim().min(1, "Nama wajib diisi").max(60, "Nama terlalu panjang"),
  wa: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, ""))
    .refine((s) => /^(\+62|62|0)8\d{8,11}$/.test(s), "Nomor WhatsApp Indonesia, mulai dengan 08 atau +62"),
  qty: z.coerce.number().int().min(1).max(MAX_QTY),
});

export type CreateResult =
  | { ok: true; orderId: string; snapToken: string }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string> };

export function newOrderId(now = new Date()) {
  const d = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10).replaceAll("-", ""); // Jakarta date
  return `JT-${d}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createOrder(input: unknown, origin: string): Promise<CreateResult> {
  const parsed = orderInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ok: false, status: 400, error: "Periksa lagi isian kamu.", fieldErrors };
  }
  const { itemId, name, wa, qty } = parsed.data;
  const item = getItem(itemId);
  if (!item) return { ok: false, status: 404, error: "Barang tidak ditemukan." };

  const id = newOrderId();
  const amount = item.price * qty;
  const db = store();
  // creating_payment before the provider call, so a Snap failure still leaves an audit trail.
  if (!(await db.reserve({ id, item_id: item.id, qty, buyer_name: name, buyer_wa: wa, amount }, item.quota)))
    return { ok: false, status: 409, error: "Slot penuh." };

  try {
    const token = await createSnapToken({
      orderId: id,
      amount,
      item: { id: item.id, name: item.name, price: item.price, qty },
      buyerName: name,
      finishUrl: `${origin}/pesanan/${id}`,
    });
    await db.setPending(id, token);
    log("order.created", { order_id: id, item_id: item.id, qty, state: "pending" });
    return { ok: true, orderId: id, snapToken: token };
  } catch {
    await db.setFailed(id);
    log("order.snap_failed", { order_id: id, state: "failed" });
    return { ok: false, status: 502, error: "Pembayaran belum bisa dibuat. Coba lagi sebentar." };
  }
}
