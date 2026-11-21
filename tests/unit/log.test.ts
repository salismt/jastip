// Promise C4. claims/checks/C4.sh runs this file.
import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/log";

afterEach(() => vi.restoreAllMocks());

describe("C4: logs never carry card data or phone numbers", () => {
  it("drops every field outside the allowlist", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log("x", {
      order_id: "JT-1",
      buyer_wa: "081234567890",
      phone: "081234567890",
      masked_card: "481111-1114",
      card_token: "tok",
      saved_token_id: "tok",
      signature_key: "abc",
      buyer_name: "Rina",
      transaction_status: "settlement",
    });
    const out = spy.mock.calls[0][0] as string;
    expect(JSON.parse(out)).toEqual({ event: "x", order_id: "JT-1", transaction_status: "settlement" });
    expect(out).not.toMatch(/0812|4811|tok|abc|Rina/);
  });
  it("drops objects even under an allowed key", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log("x", { result: { phone: "081234567890" } as unknown as string });
    expect(spy.mock.calls[0][0]).toBe('{"event":"x"}');
  });
});
