# PRD-JT-01: Jastip Tokyo, order and pay with Midtrans Snap

Status: Draft, for the IDSW 2026 demo recording.
Owner: Salis. Platform: web. Version/date: v1, 2026-11-17.
Baseline: new app. design folder for reference, make production grade UI / UX. Starter: Next.js App Router.
Design decision: one page per step, mobile first, Bahasa Indonesia on screen. No login.
Dependencies: Midtrans Snap checkout, Postgres on Supabase (project `jastip`, Singapore), Vercel (`jastip.salis.id`).

## Problem and intended outcome

Jastip (jasa titip) is a personal-shopper service. A traveler buys items abroad for buyers at home. Today the orders come in by WhatsApp chat, and the traveler checks bank transfers by hand. The traveler cannot see which slots are really paid.

The buyer opens `jastip.salis.id`, picks an item, fills in a name and a WhatsApp number, and pays with Midtrans Snap in the Snap popup. The order page shows Pending, then Paid when Midtrans confirms the payment. The slot counter on the home page counts only Paid orders.

Out of scope: login, admin screens, shipping, refunds, more than one trip, real money.

## Actors and permissions

| Actor | Can do |
|---|---|
| Buyer (anyone with the link) | View the trip, create an order, pay, view their own order page by its order ID |
| Midtrans (server to server) | Send payment notifications to the webhook |
| Traveler (Salis) | Reads orders in the database. No admin UI in v1 |

## States and transitions

| State | Action | Actor / guard | Result | Error / retry behavior |
|---|---|---|---|---|
| (none) | Submit order form | Buyer. Item has a free slot | `creating_payment`, then `pending` with a Snap token | If Snap token creation fails: `failed`, error dialog, form input kept |
| `pending` | Midtrans sends `settlement` | Signature valid AND server status check says `settlement` | `paid`, `paid_at` set, slot counted | Invalid signature: 401, no change |
| `pending` | Midtrans sends `expire`, `cancel` or `deny` | Signature valid AND status check agrees | `expired` or `failed`, slot stays free | Buyer can make a new order |
| `paid` | Any later notification | Any | No change (paid never goes back) | Returns 200 so Midtrans stops retrying |
| `paid` | The same `settlement` notification again | Any | No change, slot counted once | Returns 200 |

## Requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-01 | The home page shows the trip, three items with price, and a slot counter per item (Paid orders / quota) | AC-01 |
| FR-02 | The buyer creates an order with name, WhatsApp number and quantity 1 to 3. The form rejects an empty name and a non-Indonesian phone number | AC-02, AC-03 |
| FR-03 | The server creates the Snap token. The browser opens the Snap popup with the FR-09 methods | AC-02 |
| FR-04 | The order page shows the state from the server only, and refreshes every 2 seconds while Pending | AC-04 |
| FR-05 | An order becomes Paid only after a verified notification and a server-side status check | AC-04, AC-05 |
| FR-06 | One payment fills one slot. A repeated notification never counts twice | AC-06 |
| FR-07 | The order page shows the evidence: notification time, signature result, status check result | AC-04 |
| FR-08 | When an item has no free slot, its button shows "Slot penuh" and the order form is closed | AC-07 |
| FR-09 | The app accepts qris, gopay, credit card, and bank transfer with real money | AC-02 |

## Screens and entry flow

| Screen | Route | Entry action | States |
|---|---|---|---|
| S1 Trip | `/` | Open the link | data, item full |
| S2 Order form | `/titip/[itemId]` | Tap "Titip" on an item | editing, validation error, creating payment, Snap popup open |
| S3 Order status | `/pesanan/[orderId]` | Snap popup closes (any result) | Pending (with spinner), Paid (with evidence), Expired, Failed |

Preserved shell: none (new app). A header with "Jastip" badge on every screen.
Authorized deltas: not applicable. Prototype controls: none.


## Acceptance scenarios

| ID | Given | When from normal entry | Then: UI and resulting state | FR / screens |
|---|---|---|---|---|
| AC-01 | Seed data | Open `/` | 3 items, prices in Rupiah, "6/10 slot terisi" on Cokelat matcha, SANDBOX badge | FR-01 / S1 |
| AC-02 | Seed data | `/` → "Titip" on Cokelat matcha → name "Rina", WA "081234567890", qty 2 → "Bayar" | Snap popup opens with QRIS, GoPay, credit card and bank transfer. Order row is `pending` with amount 19000 | FR-02 FR-03 / S1 S2 |
| AC-03 | Seed data | `/titip/senbei` → empty name, WA "12345" → "Bayar" | Two field errors. No order row. No Snap call | FR-02 / S2 |
| AC-04 | An order in `pending` | A signed `settlement` notification arrives, and the status check returns `settlement` | Within 2 s the order page shows Paid and the evidence lines. The counter goes up by the quantity | FR-04 FR-05 FR-07 / S3 S1 |
| AC-05 | An order in `pending` | The browser opens `/pesanan/[id]?transaction_status=settlement` (Snap finish redirect), and no notification arrives | The order page still shows Pending. The row stays `pending` | FR-05 / S3 |
| AC-06 | An order already `paid` | The same signed `settlement` notification arrives again | Response 200. State and counter do not change | FR-06 / S1 S3 |
| AC-07 | Kue pisang at 10/10 | Open `/` | The Kue pisang button shows "Slot penuh" and is disabled. `/titip/kue-pisang` shows "Slot penuh" | FR-08 / S1 S2 |
| AC-08 | An order in `pending` | A notification arrives with a wrong signature | Response 401. The row does not change | FR-05 / S3 |

## Data

- Trip: "Jastip Tokyo", 1 to 5 Desember 2026.
- Items, all under Rp20.000: `kue-pisang` "Kue pisang khas Tokyo" Rp18.500; `coklat-matcha` "Cokelat matcha, 12 pcs" Rp9.500; `senbei` "Senbei kaleng" Rp12.000. Quota 10 each.
- Seed: 6 Paid orders on `coklat-matcha`, quantity 1 each, so its counter starts at 6/10.

## Decisions (2026-11-21, owner)

- Prices under Rp20.000, so AC-02 is now 2 × Rp9.500 = 19000 (was 190000).
- FR-09 replaces "QRIS only" in FR-03: Snap gets `other_qris`, `gopay`, `credit_card` (3DS on), `bank_transfer`.
- The SANDBOX badge (AC-01) shows whenever `MIDTRANS_IS_PRODUCTION` is not `true`.
- Open: "Out of scope: real money" contradicts FR-09. The code follows FR-09; please fix the scope line.

## Design and verification evidence

- Vitest unit tests for signature verification, the status mapping and the monotonic state rule.
- Playwright journeys for AC-01 to AC-08, run with the fake Midtrans module.
- One production run on `jastip.salis.id` with the Midtrans QRIS simulator, recorded for the talk.

## Rollout and implementation handoff