"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rupiah } from "@/lib/catalog";

type SnapCallbacks = { onSuccess?: () => void; onPending?: () => void; onError?: () => void; onClose?: () => void };
declare global {
  interface Window {
    snap?: { pay: (token: string, cb: SnapCallbacks) => void };
  }
}

type Errors = Partial<Record<"name" | "wa" | "qty", string>>;

// Same rules as the server (lib/orders/create.ts); the server check is the one that counts.
function check(name: string, wa: string): Errors {
  const e: Errors = {};
  if (!name.trim()) e.name = "Nama wajib diisi";
  if (!/^(\+62|62|0)8\d{8,11}$/.test(wa.replace(/[\s-]/g, ""))) e.wa = "Nomor WhatsApp Indonesia, mulai dengan 08 atau +62";
  return e;
}

async function waitForSnap(ms = 8000) {
  const start = Date.now();
  while (!window.snap?.pay) {
    if (Date.now() - start > ms) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
  return window.snap;
}

export function OrderForm({ item, maxQty }: { item: { id: string; name: string; price: number }; maxQty: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [wa, setWa] = useState("");
  const [qty, setQty] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local = check(name, wa);
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setFatal(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, name, wa, qty }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.fieldErrors) setErrors(json.fieldErrors);
        else setFatal(json.error ?? "Terjadi kesalahan.");
        return;
      }
      const goToOrder = () => router.push(`/pesanan/${json.orderId}`);
      const snap = await waitForSnap();
      if (!snap) {
        goToOrder();
        return;
      }
      // Snap callbacks are UX hints only. The order page reads the state from the server.
      snap.pay(json.snapToken, { onSuccess: goToOrder, onPending: goToOrder, onError: goToOrder, onClose: goToOrder });
    } catch {
      setFatal("Koneksi terputus. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-xl border bg-paper px-3 py-2.5 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold">Data penitip</h2>
      <label className="text-sm font-medium">
        Nama
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          aria-invalid={!!errors.name}
          aria-describedby="name-err"
          className={`${field} ${errors.name ? "border-brand" : "border-line"}`}
        />
        {errors.name && (
          <span id="name-err" role="alert" className="mt-1 block text-xs font-medium text-brand">
            {errors.name}
          </span>
        )}
      </label>
      <label className="text-sm font-medium">
        Nomor WhatsApp
        <input
          name="wa"
          value={wa}
          onChange={(e) => setWa(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="08xxxxxxxxxx"
          aria-invalid={!!errors.wa}
          aria-describedby="wa-err"
          className={`${field} ${errors.wa ? "border-brand" : "border-line"}`}
        />
        {errors.wa ? (
          <span id="wa-err" role="alert" className="mt-1 block text-xs font-medium text-brand">
            {errors.wa}
          </span>
        ) : (
          <span className="mt-1 block text-xs text-muted">Nomor Indonesia, mulai dengan 08 atau +62.</span>
        )}
      </label>
      <div className="text-sm font-medium">
        Jumlah
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center overflow-hidden rounded-xl border border-line bg-paper">
            <button type="button" aria-label="Kurangi" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-4 py-2 text-lg disabled:opacity-30" disabled={qty <= 1}>
              −
            </button>
            <output aria-label="Jumlah" className="w-10 border-x border-line py-2 text-center font-semibold">
              {qty}
            </output>
            <button type="button" aria-label="Tambah" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="px-4 py-2 text-lg disabled:opacity-30" disabled={qty >= maxQty}>
              +
            </button>
          </div>
          <span className="text-xs text-muted">maks. {maxQty}</span>
        </div>
      </div>
      <div className="flex items-end justify-between border-t border-line pt-4">
        <span className="text-sm text-muted">
          {qty} × {rupiah(item.price)}
        </span>
        <span className="text-2xl font-bold" data-testid="total">
          {rupiah(qty * item.price)}
        </span>
      </div>
      {fatal && (
        <div role="alertdialog" aria-label="Pembayaran gagal dibuat" className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm text-brand">
          {fatal}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-brand py-3 font-semibold text-white transition hover:bg-brand-dark active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? "Menyiapkan pembayaran…" : "Bayar"}
      </button>
      <p className="text-center text-xs text-muted">QRIS · GoPay · Kartu kredit · Transfer bank. Slot terhitung setelah lunas.</p>
    </form>
  );
}
