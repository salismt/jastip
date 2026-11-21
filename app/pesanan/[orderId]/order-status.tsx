"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { rupiah } from "@/lib/catalog";
import type { OrderView } from "@/app/api/orders/[id]/route";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export function OrderStatus({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const started = Date.now();
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
        if (res.status === 404) return setMissing(true);
        const o = (await res.json()) as OrderView;
        if (stop) return;
        setOrder(o);
        if (o.state !== "pending" && o.state !== "creating_payment") return; // final: stop polling
      } catch {
        /* network blip: try again */
      }
      // Every 2 s measured from the start of the last request, so a slow response does not stretch the cadence.
      if (!stop) timer = setTimeout(load, Math.max(0, 2000 - (Date.now() - started)));
    }
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId]);

  if (missing)
    return (
      <div className="rounded-2xl bg-sand p-6 text-center">
        <p className="font-bold">Pesanan tidak ditemukan</p>
        <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand">
          Kembali ke daftar barang
        </Link>
      </div>
    );
  if (!order) return <div className="h-64 animate-pulse rounded-2xl bg-paper" />;

  const notif = [...order.evidence].reverse().find((e) => e.source === "notification");
  const check = [...order.evidence].reverse().find((e) => e.source === "status_check");

  return (
    <>
      <div className="flex justify-between text-sm text-muted">
        <span>Pesanan</span>
        <span className="font-mono text-ink">{order.id}</span>
      </div>
      <StatusCard order={order} />

      {order.state === "paid" && (
        <section aria-label="Bukti dari server" className="mt-3 rounded-2xl border border-line bg-paper p-4">
          <h2 className="text-sm font-semibold">Bukti dari server</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {notif && <Evidence ok text={`Notifikasi diterima ${time(notif.received_at)}`} />}
            {notif && <Evidence ok={notif.signature_ok === true} text="Tanda tangan valid" />}
            {check && <Evidence ok={check.transaction_status === "settlement" || check.transaction_status === "capture"} text={`Cek status: ${check.transaction_status}`} />}
          </ul>
        </section>
      )}

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-line bg-paper p-4 text-sm">
        <dt className="text-muted">Barang</dt>
        <dd className="text-right font-semibold">{order.item_name}</dd>
        <dt className="text-muted">Jumlah</dt>
        <dd className="text-right font-semibold">{order.qty}</dd>
        <dt className="text-muted">Atas nama</dt>
        <dd className="text-right font-semibold">{order.buyer_name}</dd>
        <dt className="text-muted">WhatsApp</dt>
        <dd className="text-right font-semibold">{order.wa_masked}</dd>
        <dt className="border-t border-dashed border-line pt-2 text-muted">{order.state === "paid" ? "Total dibayar" : "Total"}</dt>
        <dd className="border-t border-dashed border-line pt-2 text-right text-lg font-bold">{rupiah(order.amount)}</dd>
      </dl>

      {order.state === "pending" && (
        <p className="mt-3 rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted">
          Halaman ini cek ke server tiap 2 detik. Slot belum terhitung sampai pembayaran lunas.
        </p>
      )}
      {(order.state === "expired" || order.state === "failed") && (
        <Link href={`/titip/${order.item_id}`} className="mt-4 rounded-xl bg-brand py-3 text-center font-semibold text-white">
          Pesan lagi
        </Link>
      )}
    </>
  );
}

function StatusCard({ order }: { order: OrderView }) {
  if (order.state === "paid")
    return (
      <section className="mt-3 flex flex-col items-center rounded-2xl bg-ok-soft p-6 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-ok text-xl text-white" aria-hidden>
          ✓
        </div>
        <h1 className="mt-3 text-xl font-bold">Pembayaran diterima</h1>
        <Badge className="bg-ok text-white">Paid</Badge>
        {order.paid_at && <p className="mt-2 text-sm text-muted">Lunas {dateTime(order.paid_at)}. Slot kamu sudah tercatat.</p>}
      </section>
    );
  if (order.state === "expired" || order.state === "failed")
    return (
      <section className="mt-3 flex flex-col items-center rounded-2xl bg-sand p-6 text-center">
        <h1 className="text-xl font-bold">{order.state === "expired" ? "Waktu pembayaran habis" : "Pembayaran gagal"}</h1>
        <Badge className="bg-ink text-white">{order.state === "expired" ? "Expired" : "Failed"}</Badge>
        <p className="mt-2 text-sm text-muted">Slot tidak terpakai. Kamu bisa membuat pesanan baru.</p>
      </section>
    );
  return (
    <section className="mt-3 flex flex-col items-center rounded-2xl bg-wait-soft p-6 text-center">
      <span aria-hidden className="size-10 animate-spin rounded-full border-4 border-wait/25 border-t-wait" />
      <h1 className="mt-3 text-xl font-bold">Menunggu pembayaran</h1>
      <Badge className="bg-wait text-white">Pending</Badge>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Status berubah setelah server menerima notifikasi Midtrans dan mengecek ulang statusnya.
      </p>
    </section>
  );
}

const Badge = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span data-testid="state-badge" className={`mt-2 rounded-full px-3 py-0.5 text-xs font-bold ${className}`}>
    {children}
  </span>
);

const Evidence = ({ ok, text }: { ok: boolean; text: string }) => (
  <li className="flex items-center gap-2">
    <span aria-hidden className={`grid size-4 place-items-center rounded-full text-[10px] text-white ${ok ? "bg-ok" : "bg-brand"}`}>
      {ok ? "✓" : "!"}
    </span>
    {text}
  </li>
);
