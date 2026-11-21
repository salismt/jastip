-- 6 made-up Paid orders on coklat-matcha (Rp9.500 each), so its counter starts at 6/10.
insert into orders (id, item_id, qty, buyer_name, buyer_wa, amount, state, paid_at) values
  ('SEED-CM-1', 'coklat-matcha', 1, 'Ayu',   '081200000000', 9500, 'paid', now()),
  ('SEED-CM-2', 'coklat-matcha', 1, 'Dimas', '081200000000', 9500, 'paid', now()),
  ('SEED-CM-3', 'coklat-matcha', 1, 'Putri', '081200000000', 9500, 'paid', now()),
  ('SEED-CM-4', 'coklat-matcha', 1, 'Bagus', '081200000000', 9500, 'paid', now()),
  ('SEED-CM-5', 'coklat-matcha', 1, 'Sari',  '081200000000', 9500, 'paid', now()),
  ('SEED-CM-6', 'coklat-matcha', 1, 'Joko',  '081200000000', 9500, 'paid', now())
on conflict (id) do nothing;
