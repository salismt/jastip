-- Jastip Tokyo schema. Apply: supabase db query --remote --yes -f db/schema.sql
create table if not exists orders (
  id            text primary key,          -- JT-20261201-AB12CD, also the Midtrans order_id
  item_id       text not null,
  qty           int  not null check (qty between 1 and 3),
  buyer_name    text not null,
  buyer_wa      text not null,
  amount        int  not null check (amount > 0),  -- Rupiah, integer
  state         text not null check (state in ('creating_payment','pending','paid','expired','failed')),
  snap_token    text,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists orders_item_state on orders (item_id, state);

create table if not exists payment_events (   -- the evidence shown on S3
  id                 bigserial primary key,
  order_id           text not null references orders(id),
  source             text not null check (source in ('notification','status_check')),
  transaction_id     text,
  transaction_status text,
  signature_ok       boolean,
  received_at        timestamptz not null default now()
);
create index if not exists payment_events_order on payment_events (order_id);

-- RLS on, no policies, no Data API grants: the public anon key cannot read or change orders.
-- The app connects as the owner through POSTGRES_URL, which RLS does not restrict.
alter table orders enable row level security;
alter table payment_events enable row level security;
revoke all on orders, payment_events from anon, authenticated;
