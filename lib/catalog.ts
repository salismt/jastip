// Static trip config. Prices are integer Rupiah, all under Rp20.000 (owner decision 2026-11-21).
export const trip = {
  name: "Jastip Tokyo",
  dates: "1–5 Desember 2026",
};

export type Item = { id: string; name: string; price: number; quota: number; emoji: string; tint: string };

export const items: Item[] = [
  { id: "kue-pisang", name: "Kue pisang khas Tokyo", price: 18500, quota: 10, emoji: "🍌", tint: "bg-amber-100" },
  { id: "coklat-matcha", name: "Cokelat matcha, 12 pcs", price: 9500, quota: 10, emoji: "🍵", tint: "bg-lime-100" },
  { id: "senbei", name: "Senbei kaleng", price: 12000, quota: 10, emoji: "🍘", tint: "bg-orange-100" },
];

export const MAX_QTY = 3;
export const HOLD_MINUTES = 15;

export const getItem = (id: string) => items.find((i) => i.id === id);

export const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
