# RFC-JT-01: Jastip Tokyo on Midtrans Snap

Status: Draft. Owner: Salis. Date: 2026-11-17.
Implements: `PRD.md` (PRD-JT-01). Read the PRD first.

## Summary

A small Next.js app at `jastip.salis.id`. Buyers order an item from one jastip trip and pay with QRIS through Midtrans Snap in production mode. An order becomes Paid only after a verified Midtrans notification and a server-side status check. The app runs on Vercel (repo `salismt/jastip`, functions in `sin1`) with Postgres in its own Supabase project in Singapore.

## Goals

1. Show the full Snap flow, from order to Paid, in one short session.
2. Keep four promises (below) as checks that run on every commit.
3. Build it in about 25 minutes of agent time, so it fits the demo recording.

Not goals: production payments, admin UI, login, scale.

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


### Configuration

| Name | Where | Value |
|---|---|---|
| `MIDTRANS_SERVER_KEY` | Vercel env, sensitive | production server key |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Vercel env | production client key |
| `MIDTRANS_IS_PRODUCTION` | Vercel env | `true` |
| `POSTGRES_URL` | Vercel env, written by the Supabase integration | pooled connection to the `jastip` Supabase project 

Vercel stores the integration values encrypted, so `vercel env pull` returns them empty. For local runs, `.env.local` (git-ignored) holds `POSTGRES_URL` with the database password, filled in by the owner. The Midtrans keys go into Vercel only.

## Infrastructure (set up before the recording, not on video)

No Terraform. salis.id is registered at Hostinger, but its nameservers are Vercel's, so Vercel manages the DNS.

1. **Repo:** public `github.com/salismt/jastip`, starting from a placeholder Next.js page and `vercel.json` with `"regions": ["sin1"]`.
2. **Database:** Supabase project `jastip` in Southeast Asia (Singapore), Free plan. New tables get row-level security and no Data API grant, so the public anon key cannot read or change orders. The app connects as the database owner through `POSTGRES_URL`, and RLS does not apply to that role. The repo is linked with `supabase link`, so `supabase db query --remote --yes -f db/schema.sql` (then `db/seed.sql`) applies them through the Management API (Supabase CLI 3.x; `--yes` is required for writes), without the database password. A Free project pauses after a week without traffic, so open it the day before recording.
3. **Vercel project:** import `salismt/jastip`, framework Next.js. Every push to `main` deploys to production.
4. **Domain:** add `jastip.salis.id` to the Vercel project. Vercel DNS creates the record and the certificate.
5. **Database connection:** connect the Supabase project to the Vercel project with the Vercel–Supabase integration, which writes `POSTGRES_URL` and the other `POSTGRES_*` and `SUPABASE_*` variables. Nobody copies the database password.
6. **Midtrans keys:** human will add the three `MIDTRANS_*` variables in Vercel → Settings → Environment Variables
7. **Midtrans dashboard:** in the salis-property production account, set the payment notification URL to `https://jastip.salis.id/api/midtrans/notification`.

Make sure that `curl -I https://jastip.salis.id` returns 200 from the placeholder page before the recording day.

## Tests

- Unit (Vitest): signature verify with a known payload, status mapping table, `settle` monotonic rule, the slot arithmetic.
- Journeys (Playwright, fake `lib/midtrans.ts`): AC-01 to AC-08.
- The fake signs notifications with a test key, so AC-04, AC-06 and AC-08 run offline.
- `npm test` runs both. The pace checks C1 and C2 call `npm test -- <file>`.
