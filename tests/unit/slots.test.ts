import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/orders/store";

const o = (id: string, qty: number) => ({ id, item_id: "senbei", qty, buyer_name: "A", buyer_wa: "081200000000", amount: 12000 * qty });

describe("slot arithmetic: taken + held + qty <= quota", () => {
  it("holds pending slots and refuses the one that does not fit", async () => {
    const db = new MemoryStore();
    expect(await db.reserve(o("a", 3), 4)).toBe(true);
    expect(await db.reserve(o("b", 2), 4)).toBe(false);
    expect(await db.reserve(o("c", 1), 4)).toBe(true);
    expect((await db.slots()).senbei).toEqual({ paid: 0, held: 4 });
  });
  it("a pending order older than 15 minutes stops holding", async () => {
    const db = new MemoryStore();
    await db.reserve(o("a", 3), 3);
    db.orders.get("a")!.created_at = new Date(Date.now() - 16 * 60_000);
    expect(await db.reserve(o("b", 3), 3)).toBe(true);
  });
  it("a failed order frees its slots", async () => {
    const db = new MemoryStore();
    await db.reserve(o("a", 3), 3);
    await db.setFailed("a");
    expect((await db.slots()).senbei).toEqual({ paid: 0, held: 0 });
  });
});
