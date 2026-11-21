import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { items, rupiah, trip, type Item } from "@/lib/catalog";
import { store } from "@/lib/orders/store";

export default function Home() {
  return (
    <>
      <p className="text-sm text-muted">Trip {trip.dates}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Titip oleh-oleh dari Tokyo</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Pilih barang, lalu bayar dengan QRIS, GoPay, kartu kredit atau transfer bank. Slot terhitung setelah
        pembayaran lunas.
      </p>
      <Suspense fallback={<ItemsSkeleton />}>
        <ItemList />
      </Suspense>
      <p className="mt-6 text-xs leading-relaxed text-muted">
        Maks. 3 per pesanan. Tanpa akun, cukup nama dan nomor WhatsApp.
      </p>
    </>
  );
}

async function ItemList() {
  await connection();
  const slots = await store().slots();
  return (
    <ul className="mt-5 flex flex-col gap-3">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} paid={slots[item.id]?.paid ?? 0} held={slots[item.id]?.held ?? 0} />
      ))}
    </ul>
  );
}

function ItemCard({ item, paid, held }: { item: Item; paid: number; held: number }) {
  const full = paid + held >= item.quota;
  return (
    <li
      data-testid={`item-${item.id}`}
      className="flex gap-3 rounded-2xl border border-line bg-paper p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)]"
    >
      <div aria-hidden className={`grid size-16 shrink-0 place-items-center rounded-xl text-3xl ${item.tint}`}>
        {item.emoji}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 className="truncate font-semibold">{item.name}</h2>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{rupiah(item.price)}</span>
          {full ? (
            <button
              disabled
              className="rounded-lg bg-sand px-3 py-1.5 text-sm font-semibold text-muted"
              aria-label={`${item.name}: Slot penuh`}
            >
              Slot penuh
            </button>
          ) : (
            <Link
              href={`/titip/${item.id}`}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark active:scale-95"
              aria-label={`Titip ${item.name}`}
            >
              Titip
            </Link>
          )}
        </div>
        <SlotBar paid={paid} held={held} quota={item.quota} />
        <p className="text-xs text-muted">
          <b className="text-ink">
            {paid}/{item.quota}
          </b>{" "}
          slot terisi{held > 0 && <span> · {held} menunggu bayar</span>}
        </p>
      </div>
    </li>
  );
}

function SlotBar({ paid, held, quota }: { paid: number; held: number; quota: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: quota }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < paid ? "bg-ok" : i < paid + held ? "bg-wait/60" : "bg-sand"}`}
        />
      ))}
    </div>
  );
}

function ItemsSkeleton() {
  return (
    <ul className="mt-5 flex flex-col gap-3" aria-busy>
      {items.map((i) => (
        <li key={i.id} className="h-[104px] animate-pulse rounded-2xl border border-line bg-paper" />
      ))}
    </ul>
  );
}
