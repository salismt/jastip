// The only logger in the app (promise C4). It prints allowlisted fields only, so a phone number,
// a buyer name, card data (masked_card, card_token, saved_token_id), a signature or a key can never reach the logs.
const ALLOWED = new Set([
  "order_id",
  "item_id",
  "qty",
  "state",
  "transaction_status",
  "fraud_status",
  "payment_type",
  "status_code",
  "http_status",
  "result",
  "sig_key", // which key matched: "server" or "secret", never the key itself
  "field_types", // e.g. "status_code:string", types only
]);

export function log(event: string, fields: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) safe[k] = v;
  }
  console.info(JSON.stringify({ event, ...safe }));
}
