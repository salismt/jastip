// Promises C1 and C2. claims/checks/C1.sh and C2.sh run this file.
import { beforeEach, describe, expect, it } from "vitest";
import { fake, signature } from "@/lib/midtrans";
import { MemoryStore, setStore } from "@/lib/orders/store";
import { settle } from "@/lib/orders/settle";

process.env.PROTOTYPE_MODE = "1";
delete process.env.MIDTRANS_SERVER_KEY;

let db: MemoryStore;
const ID = "JT-20261201-AAAAAA";

function notification(status: string, opts: { gross?: string; badSig?: boolean } = {}) {
  const gross = opts.gross ?? "19000.00";
  const code = status === "settlement" ? "200" : status === "pending" ? "201" : "202";
  return {
    order_id: ID,
    status_code: code,
    gross_amount: gross,
    transaction_status: status,
    transaction_id: "tx-1",
    payment_type: "qris",
    signature_key: opts.badSig ? "0".repeat(128) : signature(ID, code, gross),
  };
}
const statusCheck = (transaction_status: string, gross_amount = "19000.00") =>
  fake().statuses.set(ID, { found: true, transaction_status, gross_amount, transaction_id: "tx-1" });

beforeEach(async () => {
  db = new MemoryStore();
  setStore(db);
  fake().statuses.clear();
  await db.reserve({ id: ID, item_id: "coklat-matcha", qty: 2, buyer_name: "Rina", buyer_wa: "081234567890", amount: 19000 }, 10);
  await db.setPending(ID, "tok");
});

describe("C1: Paid only after a verified notification and a server-side status check", () => {
  it("C1 pays when signature is valid and the status check says settlement", async () => {
    statusCheck("settlement");
    expect(await settle(notification("settlement"))).toEqual({ status: 200, result: "paid" });
    expect((await db.get(ID))!.state).toBe("paid");
    const ev = await db.events(ID);
    expect(ev.map((e) => e.source)).toEqual(["notification", "status_check"]);
    expect(ev[0].signature_ok).toBe(true);
  });
  it("C1 rejects a wrong signature with 401 and no change", async () => {
    statusCheck("settlement");
    expect((await settle(notification("settlement", { badSig: true }))).status).toBe(401);
    expect((await db.get(ID))!.state).toBe("pending");
    expect(await db.events(ID)).toEqual([]);
  });
  it("C1 stays pending when the status check does not say settlement", async () => {
    statusCheck("pending");
    await settle(notification("settlement"));
    expect((await db.get(ID))!.state).toBe("pending");
  });
  it("C1 stays pending when the status check finds no transaction", async () => {
    await settle(notification("settlement"));
    expect((await db.get(ID))!.state).toBe("pending");
  });
  it("C1 stays pending when the paid amount does not match the order", async () => {
    statusCheck("settlement", "1000.00");
    await settle(notification("settlement", { gross: "1000.00" }));
    expect((await db.get(ID))!.state).toBe("pending");
  });
  it("C1 a signature made with another key is rejected", async () => {
    statusCheck("settlement");
    const n = notification("settlement");
    n.signature_key = signature(ID, n.status_code, n.gross_amount, "SB-Mid-server-OTHER");
    expect((await settle(n)).status).toBe(401);
    expect((await db.get(ID))!.state).toBe("pending");
  });
  it("C1 accepts a notification signed with MIDTRANS_SIGNATURE_SECRET_KEY, still gated by the status check", async () => {
    process.env.MIDTRANS_SIGNATURE_SECRET_KEY = "Mid-signature-SECRET";
    try {
      const n = notification("settlement");
      n.signature_key = signature(ID, n.status_code, n.gross_amount, "Mid-signature-SECRET");
      expect(await settle(n)).toEqual({ status: 200, result: "no_change" }); // no status check yet
      statusCheck("settlement");
      expect(await settle(n)).toEqual({ status: 200, result: "paid" });
    } finally {
      delete process.env.MIDTRANS_SIGNATURE_SECRET_KEY;
    }
  });
  it("C1 a secret-key signature is rejected when MIDTRANS_SIGNATURE_SECRET_KEY is not set", async () => {
    statusCheck("settlement");
    const n = notification("settlement");
    n.signature_key = signature(ID, n.status_code, n.gross_amount, "Mid-signature-SECRET");
    expect((await settle(n)).status).toBe(401);
  });
  it("C1 accepts an upper-case hex signature", async () => {
    statusCheck("settlement");
    const n = notification("settlement");
    n.signature_key = n.signature_key.toUpperCase();
    expect((await settle(n)).result).toBe("paid");
  });
  it("C1 expire with an agreeing status check frees the slot", async () => {
    statusCheck("expire");
    await settle(notification("expire"));
    expect((await db.get(ID))!.state).toBe("expired");
    expect((await db.slots())["coklat-matcha"]).toEqual({ paid: 0, held: 0 });
  });
});

describe("C2: one payment fills one slot, a repeated notification never counts twice", () => {
  it("C2 the same settlement twice counts once", async () => {
    statusCheck("settlement");
    await settle(notification("settlement"));
    const paidAt = (await db.get(ID))!.paid_at;
    expect(await settle(notification("settlement"))).toEqual({ status: 200, result: "no_change" });
    expect((await db.slots())["coklat-matcha"].paid).toBe(2);
    expect((await db.get(ID))!.paid_at).toEqual(paidAt);
  });
  it("C2 paid never goes back on a later expire or cancel", async () => {
    statusCheck("settlement");
    await settle(notification("settlement"));
    statusCheck("expire");
    expect((await settle(notification("expire"))).status).toBe(200);
    statusCheck("cancel");
    await settle(notification("cancel"));
    expect((await db.get(ID))!.state).toBe("paid");
    expect((await db.slots())["coklat-matcha"].paid).toBe(2);
  });
  it("C2 ten concurrent copies of one settlement count once", async () => {
    statusCheck("settlement");
    const results = await Promise.all(Array.from({ length: 10 }, () => settle(notification("settlement"))));
    expect(results.filter((r) => r.result === "paid")).toHaveLength(1);
    expect((await db.slots())["coklat-matcha"].paid).toBe(2);
  });
});
