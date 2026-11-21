// PRD-JT-01 acceptance journeys AC-01..AC-08, against PROTOTYPE_MODE (in-memory store + fake Midtrans).
import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { expectScreen } from "./adapters/screens";

const KEY = "SB-Mid-server-PROTOTYPE"; // the fake's test key, see lib/midtrans.ts

const reset = (request: APIRequestContext, scenario = "default") =>
  request.post("/api/prototype/reset", { data: { scenario } });

function signed(orderId: string, status: string, gross: string, key = KEY) {
  const code = status === "settlement" ? "200" : "201";
  return {
    order_id: orderId, status_code: code, gross_amount: gross, transaction_status: status,
    transaction_id: "fake-tx-" + orderId, payment_type: "qris",
    signature_key: createHash("sha512").update(orderId + code + gross + key).digest("hex"),
  };
}

/** Normal entry: home -> Titip -> fill -> Bayar -> close Snap -> order page. Returns the order id. */
async function orderMatcha(page: Page, qty = 2) {
  await page.goto("/");
  await page.getByRole("link", { name: "Titip Cokelat matcha, 12 pcs" }).click();
  await page.getByLabel("Nama").fill("Rina");
  await page.getByLabel("Nomor WhatsApp").fill("081234567890");
  for (let i = 1; i < qty; i++) await page.getByRole("button", { name: "Tambah" }).click();
  await page.getByRole("button", { name: "Bayar" }).click();
  const snap = page.getByRole("dialog", { name: "Midtrans Snap (prototype)" });
  await expect(snap).toBeVisible();
  await snap.getByRole("button", { name: "Tutup" }).click();
  await page.waitForURL(/\/pesanan\/JT-/);
  return page.url().split("/pesanan/")[1].split("?")[0];
}

const counter = (page: Page, itemId: string) => page.getByTestId(`item-${itemId}`);

test("AC-01 home shows trip, 3 items in Rupiah, 6/10 on Cokelat matcha, SANDBOX", { tag: "@AC-01" }, async ({ page, request }, ti) => {
  await reset(request);
  await page.goto("/");
  await expectScreen(ti, "S1", page.getByRole("heading", { name: "Titip oleh-oleh dari Tokyo" }));
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2 }) })).toHaveCount(3);
  await expect(counter(page, "kue-pisang")).toContainText("Rp18.500");
  await expect(counter(page, "coklat-matcha")).toContainText("Rp9.500");
  await expect(counter(page, "senbei")).toContainText("Rp12.000");
  await expect(counter(page, "coklat-matcha")).toContainText("6/10 slot terisi");
  await expect(page.getByText("SANDBOX", { exact: true })).toBeVisible();
});

test("AC-02 order Cokelat matcha x2 opens Snap with all 4 methods; row pending at 19000", { tag: "@AC-02" }, async ({ page, request }, ti) => {
  await reset(request);
  await page.goto("/");
  await expectScreen(ti, "S1", page.getByRole("heading", { name: "Titip oleh-oleh dari Tokyo" }));
  await page.getByRole("link", { name: "Titip Cokelat matcha, 12 pcs" }).click();
  await expectScreen(ti, "S2", page.getByRole("heading", { name: "Data penitip" }));
  await page.getByLabel("Nama").fill("Rina");
  await page.getByLabel("Nomor WhatsApp").fill("081234567890");
  await page.getByRole("button", { name: "Tambah" }).click();
  await expect(page.getByTestId("total")).toHaveText("Rp19.000");
  await page.getByRole("button", { name: "Bayar" }).click();
  const snap = page.getByRole("dialog", { name: "Midtrans Snap (prototype)" });
  await expectScreen(ti, "S2", snap);
  for (const m of ["QRIS", "GoPay", "Kartu kredit", "Transfer bank"]) await expect(snap.getByText(m, { exact: true })).toBeVisible();
  await expect(snap).toContainText("Rp19.000");
  const orders = await (await request.get("/api/prototype/orders")).json();
  const mine = orders.find((o: { buyer_name: string }) => o.buyer_name === "Rina");
  expect(mine).toMatchObject({ state: "pending", amount: 19000, qty: 2 });
});

test("AC-03 empty name and WA 12345 show two field errors, no order, no Snap call", { tag: "@AC-03" }, async ({ page, request }, ti) => {
  await reset(request);
  await page.goto("/titip/senbei");
  await expectScreen(ti, "S2", page.getByRole("heading", { name: "Data penitip" }));
  await page.getByLabel("Nomor WhatsApp").fill("12345");
  await page.getByRole("button", { name: "Bayar" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(2);
  await expect(page.getByText("Nama wajib diisi")).toBeVisible();
  await expect(page.getByText("Nomor WhatsApp Indonesia, mulai dengan 08 atau +62")).toBeVisible();
  await expectScreen(ti, "S2", page.getByText("Nama wajib diisi"));
  // The server refuses the same input too, so a bypassed browser check still makes no order.
  const res = await request.post("/api/orders", { data: { itemId: "senbei", name: "", wa: "12345", qty: 1 } });
  expect(res.status()).toBe(400);
  expect((await (await request.get("/api/prototype/orders")).json()).filter((o: { state: string }) => o.state !== "paid")).toEqual([]);
  expect(await (await request.get("/api/prototype/snap-requests")).json()).toEqual([]);
});

test("AC-04 signed settlement + agreeing status check: Paid with evidence within 2s, counter +2", { tag: "@AC-04" }, async ({ page, request }, ti) => {
  await reset(request);
  const id = await orderMatcha(page);
  await expectScreen(ti, "S3", page.getByRole("heading", { name: "Menunggu pembayaran" }));
  await request.post("/api/prototype/status", { data: { order_id: id, transaction_status: "settlement", gross_amount: "19000.00" } });
  const res = await request.post("/api/midtrans/notification", { data: signed(id, "settlement", "19000.00") });
  expect(res.status()).toBe(200);
  // waitFor watches continuously; expect().toBeVisible() retries on a back-off and can miss a 2 s window.
  await page.getByRole("heading", { name: "Pembayaran diterima" }).waitFor({ timeout: 2500 });
  const evidence = page.getByRole("region", { name: "Bukti dari server" });
  await expect(evidence).toContainText("Notifikasi diterima");
  await expect(evidence).toContainText("Tanda tangan valid");
  await expect(evidence).toContainText("Cek status: settlement");
  await expectScreen(ti, "S3", evidence);
  await page.goto("/");
  await expectScreen(ti, "S1", counter(page, "coklat-matcha").getByText("8/10"));
});

test("AC-05 Snap finish redirect with transaction_status=settlement and no notification stays Pending", { tag: "@AC-05" }, async ({ page, request }, ti) => {
  await reset(request);
  const id = await orderMatcha(page);
  await page.goto(`/pesanan/${id}?order_id=${id}&status_code=200&transaction_status=settlement`);
  await expectScreen(ti, "S3", page.getByRole("heading", { name: "Menunggu pembayaran" }));
  await page.waitForTimeout(2500); // one more poll
  await expect(page.getByTestId("state-badge")).toHaveText("Pending");
  expect((await (await request.get(`/api/prototype/order?id=${id}`)).json()).state).toBe("pending");
});

test("AC-06 the same signed settlement again returns 200 and changes nothing", { tag: "@AC-06" }, async ({ page, request }, ti) => {
  await reset(request);
  const id = await orderMatcha(page);
  await request.post("/api/prototype/status", { data: { order_id: id, transaction_status: "settlement", gross_amount: "19000.00" } });
  const n = signed(id, "settlement", "19000.00");
  expect((await request.post("/api/midtrans/notification", { data: n })).status()).toBe(200);
  await page.getByRole("heading", { name: "Pembayaran diterima" }).waitFor({ timeout: 2500 });
  const before = await (await request.get(`/api/prototype/order?id=${id}`)).json();
  const again = await request.post("/api/midtrans/notification", { data: n });
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ result: "no_change" });
  const after = await (await request.get(`/api/prototype/order?id=${id}`)).json();
  expect(after).toEqual(before);
  await page.reload();
  await expectScreen(ti, "S3", page.getByRole("heading", { name: "Pembayaran diterima" }));
  await page.goto("/");
  await expectScreen(ti, "S1", counter(page, "coklat-matcha").getByText("8/10"));
});

test("AC-07 Kue pisang at 10/10 shows Slot penuh on home and on its form", { tag: "@AC-07" }, async ({ page, request }, ti) => {
  await reset(request, "kue-pisang-full");
  await page.goto("/");
  const btn = counter(page, "kue-pisang").getByRole("button", { name: /Slot penuh/ });
  await expect(btn).toBeDisabled();
  await expectScreen(ti, "S1", btn);
  await page.goto("/titip/kue-pisang");
  await expectScreen(ti, "S2", page.getByRole("status").getByText("Slot penuh"));
  await expect(page.getByRole("button", { name: "Bayar" })).toHaveCount(0);
  const res = await request.post("/api/orders", { data: { itemId: "kue-pisang", name: "Rina", wa: "081234567890", qty: 1 } });
  expect(res.status()).toBe(409);
});

test("AC-08 a notification with a wrong signature gets 401 and the row does not change", { tag: "@AC-08" }, async ({ page, request }, ti) => {
  await reset(request);
  const id = await orderMatcha(page);
  await request.post("/api/prototype/status", { data: { order_id: id, transaction_status: "settlement", gross_amount: "19000.00" } });
  const before = await (await request.get(`/api/prototype/order?id=${id}`)).json();
  const res = await request.post("/api/midtrans/notification", { data: signed(id, "settlement", "19000.00", "SB-Mid-server-WRONG") });
  expect(res.status()).toBe(401);
  expect(await (await request.get(`/api/prototype/order?id=${id}`)).json()).toEqual(before);
  await page.waitForTimeout(2200);
  await expectScreen(ti, "S3", page.getByRole("heading", { name: "Menunggu pembayaran" }));
});
