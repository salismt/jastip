# RFC-JT-01: Jastip Tokyo on Midtrans Snap (sandbox)

Status: Draft. Owner: Salis. Date: 2026-11-17.
Implements: `PRD.md` (PRD-JT-01). Read the PRD first.

## Summary

A small Next.js app at `jastip.salis.id`. Buyers order an item from one jastip trip and pay with QRIS through Midtrans Snap in sandbox mode. An order becomes Paid only after a verified Midtrans notification and a server-side status check. The app runs on Vercel (repo `salismt/jastip`, functions in `sin1`) with Postgres in its own Supabase project in Singapore.

## Goals

1. Show the full Snap flow, from order to Paid, in one short session.
2. Keep four promises (below) as checks that run on every commit.
3. Build it in about 25 minutes of agent time, so it fits the demo recording.

Not goals: production payments, admin UI, login, scale.

## Promises (pace claims)

The repo uses agent-pace with `mode = "enforce"` from the first commit. Each claim has a check in `claims/checks/`.

| ID | Promise | To | Check |
|---|---|---|---|
| C1 | An order is Paid only after a verified Midtrans notification and a server-side status check. | Buyers | Test: AC-05 and AC-08 pass. Grep: only `lib/orders/settle.ts` writes the `paid` state |
| C2 | One payment fills one slot. The same notification twice never counts twice. | Buyers | Test: AC-06 passes |
| C3 | The Midtrans server key never reaches the browser. | Midtrans | Grep: no `NEXT_PUBLIC_*SERVER_KEY`. `MIDTRANS_SERVER_KEY` is read only in files that import `server-only` |
| C4 | This app never takes real money. | Audience | Grep: every Midtrans base URL in the code contains `sandbox`, and `lib/midtrans.ts` throws unless `MIDTRANS_IS_PRODUCTION` is `false` |

## Stack

The same choices as salis-property, so the agent can copy known patterns:
- Next.js 16 App Router, React 19, TypeScript, Tailwind.
- `postgres` (postgres.js) for the database, through Supabase's transaction pooler (`POSTGRES_URL`, port 6543), so the client needs `prepare: false`; `zod` for input checks, `server-only` for server modules.
- Vitest for unit tests, Playwright for journeys.
- No ORM, no state library, no UI kit beyond Tailwind.

## Design

### Files

```
app/page.tsx                         S1 trip and items
app/titip/[itemId]/page.tsx          S2 order form
app/pesanan/[orderId]/page.tsx       S3 order status (polls every 2 s while pending)
app/api/orders/route.ts              POST: create order + Snap token
app/api/orders/[id]/route.ts         GET: state + evidence
app/api/midtrans/notification/route.ts   POST: webhook
lib/catalog.ts                       trip and items (static config)
lib/db.ts                            postgres client
lib/midtrans.ts                      createSnapToken, getStatus, verifySignature (server-only)
lib/orders/settle.ts                 the only place that changes payment state
db/schema.sql                        tables
db/seed.sql                          6 made-up Paid orders on coklat-matcha
claims/checks/C1..C4                 pace checks
pace.toml                            the ledger (owner edits only)
```

### Data

```sql
create table orders (
  id            text primary key,          -- JT-20261201-AB12CD, also the Midtrans order_id
  item_id       text not null,
  qty           int  not null check (qty between 1 and 3),
  buyer_name    text not null,
  buyer_wa      text not null,
  amount        int  not null,             -- Rupiah, integer
  state         text not null check (state in ('creating_payment','pending','paid','expired','failed')),
  snap_token    text,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table payment_events (               -- the evidence shown on S3
  id                 bigserial primary key,
  order_id           text not null references orders(id),
  source             text not null check (source in ('notification','status_check')),
  transaction_id     text,
  transaction_status text,
  signature_ok       boolean,
  received_at        timestamptz not null default now()
);
```

Slots taken for an item = `sum(qty)` of its `paid` orders. Slots held = `sum(qty)` of `pending` orders younger than 15 minutes. A new order is allowed when taken + held + qty ≤ quota.

### Payment flow

1. `POST /api/orders` checks the input with zod and the free slots. It inserts the order as `creating_payment`, then calls Snap `POST https://app.sandbox.midtrans.com/snap/v1/transactions` with Basic Auth (server key, empty password). The body has `transaction_details.order_id`, `gross_amount` as an integer, `enabled_payments: ["other_qris"]` and an expiry of 15 minutes. It saves the token and sets `pending`. If Snap fails, it sets `failed` and returns the provider message.
2. The browser loads `https://app.sandbox.midtrans.com/snap/snap.js` with the client key and calls `snap.pay(token)`. Every callback (`onSuccess`, `onPending`, `onError`, `onClose`) only navigates to `/pesanan/[id]`. No callback changes state.
3. `POST /api/midtrans/notification`:
   1. Verify `signature_key = SHA512(order_id + status_code + gross_amount + serverKey)`. Use the raw `gross_amount` string from the payload. If it does not match, store an event with `signature_ok = false` and return 401.
   2. Call `GET https://api.sandbox.midtrans.com/v2/{order_id}/status`. Store it as a `status_check` event.
   3. Call `settle(orderId, statusFromCheck)`. It maps `settlement` → `paid`; `capture` with `fraud_status = accept` → `paid`; `expire` → `expired`; `cancel`, `deny`, `failure` → `failed`; `pending` → no change.
   4. `settle` is monotonic. `paid` never changes again. It runs in one transaction with `select ... for update` on the order row, so two notifications at the same time count once.
   5. Return 200.
4. S3 polls `GET /api/orders/[id]` every 2 seconds while the state is `pending`, and shows the evidence lines when Paid:
   `Notifikasi diterima 14:03:11 · tanda tangan valid · cek status: settlement`.

### Configuration

| Name | Where | Value |
|---|---|---|
| `MIDTRANS_SERVER_KEY` | Vercel env, sensitive | sandbox server key |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Vercel env | sandbox client key |
| `MIDTRANS_IS_PRODUCTION` | Vercel env | `false` |
| `POSTGRES_URL` | Vercel env, written by the Supabase integration | pooled connection to the `jastip` Supabase project |

Vercel stores the integration values encrypted, so `vercel env pull` returns them empty. For local runs, `.env.local` (git-ignored) holds `POSTGRES_URL` with the database password, filled in by the owner. The Midtrans keys go into Vercel only.

## Infrastructure (set up before the recording, not on video)

No Terraform. salis.id is registered at Hostinger, but its nameservers are Vercel's, so Vercel manages the DNS.

1. **Repo:** public `github.com/salismt/jastip`, starting from a placeholder Next.js page and `vercel.json` with `"regions": ["sin1"]`.
2. **Database:** Supabase project `jastip` in Southeast Asia (Singapore), Free plan. New tables get row-level security and no Data API grant, so the public anon key cannot read or change orders. The app connects as the database owner through `POSTGRES_URL`, and RLS does not apply to that role. The repo is linked with `supabase link`, so `supabase db query --remote --yes -f db/schema.sql` (then `db/seed.sql`) applies them through the Management API (Supabase CLI 3.x; `--yes` is required for writes), without the database password. A Free project pauses after a week without traffic, so open it the day before recording.
3. **Vercel project:** import `salismt/jastip`, framework Next.js. Every push to `main` deploys to production.
4. **Domain:** add `jastip.salis.id` to the Vercel project. Vercel DNS creates the record and the certificate.
5. **Database connection:** connect the Supabase project to the Vercel project with the Vercel–Supabase integration, which writes `POSTGRES_URL` and the other `POSTGRES_*` and `SUPABASE_*` variables. Nobody copies the database password.
6. **Midtrans keys:** you add the three `MIDTRANS_*` variables in Vercel → Settings → Environment Variables, from the salis-property sandbox account.
7. **Midtrans dashboard (sandbox):** in the salis-property sandbox account, set the payment notification URL to `https://jastip.salis.id/api/midtrans/notification`.

Make sure that `curl -I https://jastip.salis.id` returns 200 from the placeholder page before the recording day.

## Tests

- Unit (Vitest): signature verify with a known payload, status mapping table, `settle` monotonic rule, the slot arithmetic.
- Journeys (Playwright, fake `lib/midtrans.ts`): AC-01 to AC-08.
- The fake signs notifications with a test key, so AC-04, AC-06 and AC-08 run offline.
- `npm test` runs both. The pace checks C1 and C2 call `npm test -- <file>`.

## Alternatives considered

- **Core API with a custom QRIS screen:** more code and more screens, and the demo is about the promise, not the UI. Snap is shorter.
- **Cloud Run and Cloud SQL in the salis-property GCP project:** it needs a Terraform change to the shared load balancer and a new certificate, which takes about a day. Vercel and Supabase take minutes, and git push becomes the deploy.
- **Firestore in place of Postgres:** the row lock in `settle` is simpler in SQL.

## Open questions

None open. Decided 19 Nov: jastip uses the salis-property sandbox account and its notification URL; the repo is `salismt/jastip`, public.
