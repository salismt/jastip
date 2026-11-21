# Jastip Tokyo

Demo shop for the IDSW 2026 talk "Your AI agent is too fast". Buyers order from one jastip trip and pay through Midtrans Snap with QRIS, GoPay, credit card (3DS) or bank transfer (VA).

Stack: Next.js on Vercel (`jastip.salis.id`, functions in `sin1`), Postgres on Supabase (Singapore). Spec: [PRD.md](PRD.md), [RFC.md](RFC.md). Promises: [pace.toml](pace.toml), checks in `claims/checks/`.

## Run

```bash
npm install
npm run dev:prototype   # http://localhost:3100, in-memory store + fake Midtrans, no keys needed
npm run dev             # real mode: needs POSTGRES_URL and the MIDTRANS_* variables in .env.local
npm test                # Vitest: signature, status mapping, settle (C1, C2), slots, log redaction (C4)
npm run test:e2e        # Playwright: AC-01..AC-08 against prototype mode; evidence in prototype/evidence/
```

## Midtrans keys on Vercel

The project is already linked (`.vercel/project.json`). Each command asks for the value on stdin, so the key never lands in your shell history. On Production and Preview, `vercel env add` stores values as sensitive by default.

Production, real money (FR-09). Use the keys from the **production** Midtrans account:

```bash
vercel env add MIDTRANS_SERVER_KEY production
```

```bash
vercel env add NEXT_PUBLIC_MIDTRANS_CLIENT_KEY production
```

```bash
vercel env add MIDTRANS_IS_PRODUCTION production --value true --no-sensitive
```

Preview deploys, sandbox (recommended, so a preview URL never takes real money):

```bash
vercel env add MIDTRANS_SERVER_KEY preview
```

```bash
vercel env add NEXT_PUBLIC_MIDTRANS_CLIENT_KEY preview
```

```bash
vercel env add MIDTRANS_IS_PRODUCTION preview --value false --no-sensitive
```

Check the names (values stay hidden), then redeploy. The client key and the Snap script URL are fixed at build time, so a deploy is needed after any change:

```bash
vercel env ls
```

```bash
vercel --prod
```

Never set `PROTOTYPE_MODE` on Vercel. `POSTGRES_URL` comes from the Vercel–Supabase integration (RFC step 5).

## Midtrans dashboard (production account)

1. Settings → Payment → Notification URL: `https://jastip.salis.id/api/midtrans/notification`.
2. Finish redirect URL: not needed; the app sends `callbacks.finish` per order.
3. Make sure QRIS, GoPay, credit card and the bank-transfer VAs (BCA, BNI, BRI, Permata, Mandiri bill) are active. Snap hides any method that is not active.

## Database

```bash
supabase db query --remote --yes -f db/schema.sql
```

```bash
supabase db query --remote --yes -f db/seed.sql
```
