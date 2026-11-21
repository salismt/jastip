import { checkSignature, getStatus, mapStatus } from "../midtrans";
import { log } from "../log";
import { store } from "./store";

type Notification = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * The only place that changes payment state after an order is created (promises C1 and C2).
 * Paid needs: a valid signature, AND a server-side status check that agrees, AND an amount match.
 * Only a pending order moves, and it moves once, so a repeated notification never counts twice.
 */
export async function settle(n: Notification): Promise<{ status: number; result: string }> {
  const orderId = str(n.order_id);
  const sig = checkSignature(n);
  if (!sig.key) {
    log("notification.rejected", { order_id: orderId ?? "?", result: "bad_signature", field_types: sig.fieldTypes });
    return { status: 401, result: "bad_signature" };
  }
  log("notification.verified", { order_id: orderId!, sig_key: sig.key });
  const db = store();
  const order = await db.get(orderId!);
  if (!order) {
    // Dashboard test notifications use made-up order ids. 200 so Midtrans stops retrying.
    log("notification.ignored", { order_id: orderId!, result: "unknown_order" });
    return { status: 200, result: "unknown_order" };
  }

  const notified = str(n.transaction_status);
  await db.addEvent({
    order_id: order.id,
    source: "notification",
    transaction_id: str(n.transaction_id),
    transaction_status: notified,
    signature_ok: true,
  });

  if (order.state !== "pending") {
    log("notification.noop", { order_id: order.id, state: order.state, transaction_status: notified ?? "" });
    return { status: 200, result: "no_change" };
  }

  const checked = await getStatus(order.id);
  await db.addEvent({
    order_id: order.id,
    source: "status_check",
    transaction_id: checked.transaction_id ?? null,
    transaction_status: checked.found ? checked.transaction_status ?? null : "not_found",
    signature_ok: null,
  });

  const target = checked.found ? mapStatus(checked.transaction_status, checked.fraud_status) : null;
  const agrees = target !== null && target === mapStatus(notified ?? undefined, str(n.fraud_status) ?? undefined);
  const amountOk = target !== "paid" || Number(checked.gross_amount) === order.amount;

  if (!agrees || !amountOk || target === "pending") {
    log("notification.held", {
      order_id: order.id,
      transaction_status: checked.transaction_status ?? "not_found",
      result: !amountOk ? "amount_mismatch" : target === "pending" ? "still_pending" : "status_disagrees",
    });
    return { status: 200, result: "no_change" };
  }

  const moved = await db.transition(order.id, target);
  log("order.transition", {
    order_id: order.id,
    state: target,
    payment_type: checked.payment_type ?? "",
    result: moved ? "moved" : "no_change",
  });
  return { status: 200, result: moved ? target : "no_change" };
}
