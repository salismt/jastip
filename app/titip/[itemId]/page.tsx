import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getItem, rupiah } from "@/lib/catalog";
import { store } from "@/lib/orders/store";
import { OrderForm } from "./order-form";

export default function TitipPage({ params }: PageProps<"/titip/[itemId]">) {
  return (
    <>
      <Link href="/" className="text-sm font-medium text-brand">
        ‹ Kembali
      </Link>
      <Suspense fallback={<div className="mt-3 h-20 animate-pulse rounded-2xl border border-line bg-paper" />}>
        <Titip params={params} />
      </Suspense>
    </>
  );
}

async function Titip({ params }: { params: PageProps<"/titip/[itemId]">["params"] }) {
  const { itemId } = await params;
  const item = getItem(itemId);
  if (!item) notFound();
  await connection();
  const s = (await store().slots())[item.id] ?? { paid: 0, held: 0 };
  const free = Math.max(0, item.quota - s.paid - s.held);

  return (
    <>
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
        <div aria-hidden className={`grid size-12 place-items-center rounded-xl text-2xl ${item.tint}`}>
          {item.emoji}
        </div>
        <div>
          <h1 className="font-semibold">{item.name}</h1>
          <p className="text-sm text-muted">
            {rupiah(item.price)} · sisa {free} slot
          </p>
        </div>
      </div>
      {free === 0 ? (
        <div role="status" className="mt-6 rounded-2xl bg-sand p-5 text-center">
          <p className="text-lg font-bold">Slot penuh</p>
          <p className="mt-1 text-sm text-muted">Semua slot untuk barang ini sudah terisi. Coba barang lain.</p>
        </div>
      ) : (
        <OrderForm item={{ id: item.id, name: item.name, price: item.price }} maxQty={Math.min(3, free)} />
      )}
    </>
  );
}
