import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { prototypeMode, isProduction } from "./env";
import { log } from "./log";

// Midtrans Snap (token) + Core API (status). Server key stays here, server-side only (promise C3).

export const ENABLED_PAYMENTS = ["other_qris", "gopay", "credit_card", "bank_transfer"] as const;
export const PROTOTYPE_SERVER_KEY = "SB-Mid-server-PROTOTYPE";

const serverKey = () => {
  const k = process.env.MIDTRANS_SERVER_KEY;
  if (k) return k;
  if (prototypeMode()) return PROTOTYPE_SERVER_KEY;
  throw new Error("MIDTRANS_SERVER_KEY is not set");
};
const snapBase = () => (isProduction() ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com");
const coreBase = () => (isProduction() ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com");
const auth = () => "Basic " + Buffer.from(serverKey() + ":").toString("base64");

export type SnapRequest = {
  orderId: string;
  amount: number;
  item: { id: string; name: string; price: number; qty: number };
  buyerName: string;
  finishUrl: string;
};

export type StatusResult = {
  found: boolean;
  transaction_status?: string;
  fraud_status?: string;
  gross_amount?: string;
  transaction_id?: string;
  payment_type?: string;
};

/** Jakarta time "yyyy-MM-dd HH:mm:ss +0700", as Snap expiry.start_time expects. */
function jakartaNow() {
  const d = new Date(Date.now() + 7 * 3600_000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 19)} +0700`;
}

export function snapPayload(r: SnapRequest) {
  return {
    transaction_details: { order_id: r.orderId, gross_amount: r.amount },
    item_details: [{ id: r.item.id, price: r.item.price, quantity: r.item.qty, name: r.item.name.slice(0, 50) }],
    // First name only: the WhatsApp number stays in our database and never goes to Midtrans.
    customer_details: { first_name: r.buyerName.slice(0, 50) },
    enabled_payments: ENABLED_PAYMENTS,
    credit_card: { secure: true },
    callbacks: { finish: r.finishUrl },
    // Matches the 15-minute slot hold.
    expiry: { start_time: jakartaNow(), unit: "minutes", duration: 15 },
  };
}

export async function createSnapToken(r: SnapRequest): Promise<string> {
  const body = snapPayload(r);
  if (prototypeMode()) return fake().createToken(body);
  const res = await fetch(`${snapBase()}/snap/v1/transactions`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  log("snap.create", { order_id: r.orderId, http_status: res.status });
  if (!res.ok) throw new Error(`Snap token request failed (${res.status})`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error("Snap token missing");
  return json.token;
}

export async function getStatus(orderId: string): Promise<StatusResult> {
  if (prototypeMode()) return fake().status(orderId);
  const res = await fetch(`${coreBase()}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Authorization: auth(), Accept: "application/json" },
    cache: "no-store",
  });
  const json = (await res.json()) as Record<string, string>;
  // Before the buyer picks a method, Midtrans answers 404 inside the body. That means "not attempted yet".
  if (!res.ok || json.status_code === "404") return { found: false };
  return {
    found: true,
    transaction_status: json.transaction_status,
    fraud_status: json.fraud_status,
    gross_amount: json.gross_amount,
    transaction_id: json.transaction_id,
    payment_type: json.payment_type,
  };
}

/** SHA512(order_id + status_code + gross_amount + serverKey), with gross_amount exactly as Midtrans sent it. */
export function signature(orderId: string, statusCode: string, grossAmount: string, key = serverKey()) {
  return createHash("sha512").update(orderId + statusCode + grossAmount + key).digest("hex");
}

type SignedFields = { order_id?: unknown; status_code?: unknown; gross_amount?: unknown; signature_key?: unknown };

/** Keys Midtrans may sign with: the server key (Snap docs), then MIDTRANS_SIGNATURE_SECRET_KEY when it is set. */
function signingKeys(): { name: "server" | "secret"; key: string }[] {
  const keys: { name: "server" | "secret"; key: string }[] = [{ name: "server", key: serverKey() }];
  const secret = process.env.MIDTRANS_SIGNATURE_SECRET_KEY?.trim();
  if (secret) keys.push({ name: "secret", key: secret });
  return keys;
}

/**
 * Which key signed this notification, or null. `fieldTypes` is safe to log (types only, no values),
 * so a rejected real notification can be diagnosed without logging the payload.
 */
export function checkSignature(n: SignedFields): { key: "server" | "secret" | null; fieldTypes: string } {
  const fields = { order_id: n.order_id, status_code: n.status_code, gross_amount: n.gross_amount, signature_key: n.signature_key };
  const fieldTypes = Object.entries(fields).map(([k, v]) => `${k}:${typeof v}`).join(",");
  const raw = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
  const [id, code, gross] = [raw(n.order_id), raw(n.status_code), raw(n.gross_amount)];
  if (id === null || code === null || gross === null || typeof n.signature_key !== "string") return { key: null, fieldTypes };
  const got = Buffer.from(n.signature_key.toLowerCase());
  for (const { name, key } of signingKeys()) {
    const want = Buffer.from(signature(id, code, gross, key));
    if (got.length === want.length && timingSafeEqual(got, want)) return { key: name, fieldTypes };
  }
  return { key: null, fieldTypes };
}

export function verifySignature(n: SignedFields) {
  return checkSignature(n).key !== null;
}

export type Target = "paid" | "expired" | "failed" | "pending";

/** One status rule for notifications and status checks. */
export function mapStatus(status?: string, fraud?: string): Target | null {
  switch (status) {
    case "settlement":
      return "paid";
    case "capture":
      return fraud === "accept" ? "paid" : "pending"; // challenge stays pending
    case "pending":
      return "pending";
    case "expire":
      return "expired";
    case "cancel":
    case "deny":
    case "failure":
      return "failed";
    default:
      return null; // refund, partial_refund, unknown: no state change in v1
  }
}

// ---- Prototype fake (PROTOTYPE_MODE=1 only) ----
type Fake = {
  requests: unknown[];
  statuses: Map<string, StatusResult>;
  failNext: boolean;
  createToken(body: unknown): string;
  status(id: string): StatusResult;
};
const g = globalThis as unknown as { __fakeMidtrans?: Fake };
export function fake(): Fake {
  if (!prototypeMode()) throw new Error("fake Midtrans is prototype-only");
  return (g.__fakeMidtrans ??= {
    requests: [],
    statuses: new Map(),
    failNext: false,
    createToken(body) {
      if (this.failNext) {
        this.failNext = false;
        throw new Error("fake Snap failure");
      }
      this.requests.push(body);
      return "fake-snap-" + this.requests.length;
    },
    status(id) {
      return this.statuses.get(id) ?? { found: false };
    },
  });
}
