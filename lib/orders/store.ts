import { HOLD_MINUTES } from "../catalog";
import { prototypeMode } from "../env";

export type OrderState = "creating_payment" | "pending" | "paid" | "expired" | "failed";

export type Order = {
  id: string;
  item_id: string;
  qty: number;
  buyer_name: string;
  buyer_wa: string;
  amount: number;
  state: OrderState;
  snap_token: string | null;
  paid_at: Date | null;
  created_at: Date;
};

export type PaymentEvent = {
  order_id: string;
  source: "notification" | "status_check";
  transaction_id: string | null;
  transaction_status: string | null;
  signature_ok: boolean | null;
  received_at: Date;
};

export type NewOrder = Pick<Order, "id" | "item_id" | "qty" | "buyer_name" | "buyer_wa" | "amount">;
export type Slots = Record<string, { paid: number; held: number }>;

export interface Store {
  slots(): Promise<Slots>;
  /** Inserts the order as creating_payment only if paid + held + qty <= quota. Atomic per item. */
  reserve(o: NewOrder, quota: number): Promise<boolean>;
  setPending(id: string, snapToken: string): Promise<void>;
  setFailed(id: string): Promise<void>;
  get(id: string): Promise<Order | null>;
  events(id: string): Promise<PaymentEvent[]>;
  addEvent(e: Omit<PaymentEvent, "received_at">): Promise<void>;
  /** The only payment-state change after creation: pending -> to. Returns false when the order is not pending. */
  transition(id: string, to: "paid" | "expired" | "failed"): Promise<boolean>;
}

const holdCutoff = () => Date.now() - HOLD_MINUTES * 60_000;
const holds = (o: Order) =>
  (o.state === "pending" || o.state === "creating_payment") && o.created_at.getTime() > holdCutoff();

// ponytail: in-memory store for prototype mode and unit tests; single process, JS is single-threaded so each method is atomic.
export class MemoryStore implements Store {
  orders = new Map<string, Order>();
  log: PaymentEvent[] = [];

  async slots() {
    const s: Slots = {};
    for (const o of this.orders.values()) {
      const e = (s[o.item_id] ??= { paid: 0, held: 0 });
      if (o.state === "paid") e.paid += o.qty;
      else if (holds(o)) e.held += o.qty;
    }
    return s;
  }
  async reserve(o: NewOrder, quota: number) {
    const s = (await this.slots())[o.item_id] ?? { paid: 0, held: 0 };
    if (s.paid + s.held + o.qty > quota) return false;
    this.orders.set(o.id, { ...o, state: "creating_payment", snap_token: null, paid_at: null, created_at: new Date() });
    return true;
  }
  async setPending(id: string, token: string) {
    const o = this.orders.get(id);
    if (o?.state === "creating_payment") Object.assign(o, { state: "pending", snap_token: token });
  }
  async setFailed(id: string) {
    const o = this.orders.get(id);
    if (o?.state === "creating_payment") o.state = "failed";
  }
  async get(id: string) {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }
  async events(id: string) {
    return this.log.filter((e) => e.order_id === id);
  }
  async addEvent(e: Omit<PaymentEvent, "received_at">) {
    this.log.push({ ...e, received_at: new Date() });
  }
  async transition(id: string, to: "paid" | "expired" | "failed") {
    const o = this.orders.get(id);
    if (!o || o.state !== "pending") return false;
    o.state = to;
    if (to === "paid") o.paid_at = new Date();
    return true;
  }
}

class PgStore implements Store {
  // Lazy import keeps postgres.js out of prototype runs and unit tests.
  private sql = async () => (await import("../db")).sql;

  async slots() {
    const sql = await this.sql();
    const rows = await sql<{ item_id: string; paid: number; held: number }[]>`
      select item_id,
        coalesce(sum(qty) filter (where state = 'paid'), 0)::int as paid,
        coalesce(sum(qty) filter (where state in ('pending','creating_payment')
          and created_at > now() - make_interval(mins => ${HOLD_MINUTES})), 0)::int as held
      from orders group by item_id`;
    return Object.fromEntries(rows.map((r) => [r.item_id, { paid: r.paid, held: r.held }]));
  }
  async reserve(o: NewOrder, quota: number) {
    const sql = await this.sql();
    return sql.begin(async (tx) => {
      // Serialize reservations per item so two buyers cannot take the last slot together.
      await tx`select pg_advisory_xact_lock(hashtext(${o.item_id}))`;
      const [{ used }] = await tx<{ used: number }[]>`
        select coalesce(sum(qty), 0)::int as used from orders
        where item_id = ${o.item_id} and (state = 'paid' or (state in ('pending','creating_payment')
          and created_at > now() - make_interval(mins => ${HOLD_MINUTES})))`;
      if (used + o.qty > quota) return false;
      await tx`insert into orders (id, item_id, qty, buyer_name, buyer_wa, amount, state)
        values (${o.id}, ${o.item_id}, ${o.qty}, ${o.buyer_name}, ${o.buyer_wa}, ${o.amount}, 'creating_payment')`;
      return true;
    });
  }
  async setPending(id: string, token: string) {
    const sql = await this.sql();
    await sql`update orders set state = 'pending', snap_token = ${token}, updated_at = now()
      where id = ${id} and state = 'creating_payment'`;
  }
  async setFailed(id: string) {
    const sql = await this.sql();
    await sql`update orders set state = 'failed', updated_at = now() where id = ${id} and state = 'creating_payment'`;
  }
  async get(id: string) {
    const sql = await this.sql();
    const [o] = await sql<Order[]>`select id, item_id, qty, buyer_name, buyer_wa, amount, state, snap_token, paid_at, created_at
      from orders where id = ${id}`;
    return o ?? null;
  }
  async events(id: string) {
    const sql = await this.sql();
    return sql<PaymentEvent[]>`select order_id, source, transaction_id, transaction_status, signature_ok, received_at
      from payment_events where order_id = ${id} order by id`;
  }
  async addEvent(e: Omit<PaymentEvent, "received_at">) {
    const sql = await this.sql();
    await sql`insert into payment_events (order_id, source, transaction_id, transaction_status, signature_ok)
      values (${e.order_id}, ${e.source}, ${e.transaction_id}, ${e.transaction_status}, ${e.signature_ok})`;
  }
  async transition(id: string, to: "paid" | "expired" | "failed") {
    const sql = await this.sql();
    // The where clause is the monotonic + idempotent rule: only a pending row moves, once.
    const rows = await sql`update orders set state = ${to}, updated_at = now(),
      paid_at = case when ${to} = 'paid' then now() else paid_at end
      where id = ${id} and state = 'pending' returning id`;
    return rows.length === 1;
  }
}

const g = globalThis as unknown as { __jastipStore?: Store };
export function store(): Store {
  return (g.__jastipStore ??= prototypeMode() ? new MemoryStore() : new PgStore());
}
/** Prototype/test only. */
export function setStore(s: Store) {
  g.__jastipStore = s;
}
