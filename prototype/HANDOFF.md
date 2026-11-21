# PRD-JT-01 prototype handoff

Status: **ready for product review**. Not reviewed yet. Not verified against real Midtrans.

## Source and baseline

- Repo: this folder, branch `main`. Baseline commit `4ef218c` (placeholder page). New app, so the baseline is the starter; there is no deployed UI to compare.
- Prototype = the real app in `PROTOTYPE_MODE=1`: in-memory store (`MemoryStore`) and fake Midtrans (`fake()` in `lib/midtrans.ts`). Seam: the app's own route handlers and `lib/midtrans.ts`. `/api/prototype/*` answers 404 outside prototype mode (checked on a production build).
- Parity: `snapshot.py verify` not run. The prototype lives in the product repo; every change since `4ef218c` is the feature (`git diff 4ef218c --name-status`).

## UI profile

Next.js 16.4 App Router, Cache Components + Partial Prefetching on, Turbopack, Tailwind 4 tokens in `app/globals.css`, no UI kit. Data reads call `connection()` inside `<Suspense>`. Runner: Vitest (unit) and Playwright 1.56 (journeys).

## Results (2026-11-21)

| Run | AC passed | Evidence |
|---|---|---|
| Red baseline, placeholder app | 0 / 8, each fails on its product assertion | `baseline-evidence/` |
| Feature, prototype mode | 8 / 8, screens S1 S2 S3 all visited | `evidence/`, `evidence/coverage.json` |

`check_coverage.py` exit 0. Unit tests: 31 / 31. Ego-browser walkthrough: `screens/1-trip.png` … `screens/6-trip-after.png`.

Commands: `npx playwright test`; `python3 ~/.claude/skills/prd-to-prototype/scripts/check_coverage.py --contract prototype/coverage-contract.json --results prototype/evidence/scenario-results.json --artifact-root prototype`.

## Mocked, and not yet proven

- Midtrans Snap and the status API are fake. The real Snap popup, real QRIS/GoPay/card/VA payment and a real notification have not run, because no Midtrans key is available locally.
- The Postgres store runs the same rules in SQL (advisory lock per item, `where state = 'pending'`). Unit tests cover the memory store only; C2's check greps the SQL guard. The local production build read live slot counts from Supabase (6/10).
- Next step: one sandbox order on a Preview deploy, then the production run for the talk.

## Midtrans readiness

| Item | State |
|---|---|
| Account / keys | Production account (RFC); keys go into Vercel by the owner. Missing locally |
| Methods | `other_qris`, `gopay`, `credit_card` (3DS), `bank_transfer`. Activation in the production dashboard: not confirmed |
| Notification URL | `https://jastip.salis.id/api/midtrans/notification`. Dashboard setting: not confirmed |
| Proof expected | AC-01..AC-08 offline (done), one live run on `jastip.salis.id` (pending) |
