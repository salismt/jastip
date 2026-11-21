import { describe, expect, it } from "vitest";
process.env.PROTOTYPE_MODE = "1";
import { mapStatus, signature, snapPayload, verifySignature } from "@/lib/midtrans";

describe("signature", () => {
  it("matches SHA512(order_id + status_code + gross_amount + server_key) from the Midtrans docs", () => {
    // Known payload: sha512("Postman-1578568851" + "200" + "10000.00" + "VT-server-HJMpl9HLr_ntOKt5mRONdmKj")
    const s = signature("Postman-1578568851", "200", "10000.00", "VT-server-HJMpl9HLr_ntOKt5mRONdmKj");
    expect(s).toBe("e78e2223638cb60dbdbc88d23deb9b927ac41be7263ab38758605bac834dc25425705543707504bfef0802914cfa3f5f538fa308d1f9086211c420e7892ba2ba"); // computed independently with shasum -a 512
  });
  it("hashes gross_amount as sent, not reformatted", () => {
    expect(signature("A", "200", "10000.00", "k")).not.toBe(signature("A", "200", "10000", "k"));
  });
  it("rejects missing fields and wrong length", () => {
    expect(verifySignature({ order_id: "A" })).toBe(false);
    expect(verifySignature({ order_id: "A", status_code: "200", gross_amount: "1", signature_key: "abc" })).toBe(false);
  });
});

describe("status mapping", () => {
  it.each([
    ["settlement", undefined, "paid"],
    ["capture", "accept", "paid"],
    ["capture", "challenge", "pending"],
    ["pending", undefined, "pending"],
    ["expire", undefined, "expired"],
    ["cancel", undefined, "failed"],
    ["deny", undefined, "failed"],
    ["failure", undefined, "failed"],
    ["refund", undefined, null],
  ])("%s/%s -> %s", (s, f, want) => expect(mapStatus(s, f)).toBe(want));
});

describe("snap payload", () => {
  const p = snapPayload({
    orderId: "JT-1", amount: 19000, buyerName: "Rina", finishUrl: "https://x/pesanan/JT-1",
    item: { id: "coklat-matcha", name: "Cokelat matcha, 12 pcs", price: 9500, qty: 2 },
  });
  it("enables QRIS, GoPay, card (3DS) and bank transfer", () => {
    expect(p.enabled_payments).toEqual(["other_qris", "gopay", "credit_card", "bank_transfer"]);
    expect(p.credit_card).toEqual({ secure: true });
  });
  it("item total equals gross_amount, integer", () => {
    expect(p.item_details[0].price * p.item_details[0].quantity).toBe(p.transaction_details.gross_amount);
  });
  it("never sends the WhatsApp number to Midtrans", () => {
    expect(JSON.stringify(p)).not.toMatch(/0812|phone/);
  });
  it("expiry start_time is Jakarta time", () => {
    expect(p.expiry.start_time).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \+0700$/);
  });
});
