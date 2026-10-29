import assert from "node:assert/strict";
import test from "node:test";
import { moneyCents, parseInvoiceForm, paymentStatus, validateInvoiceFile, MAX_INVOICE_FILE_BYTES } from "./invoice-input";

function form(patch: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ id: "b1000000-0000-4000-8000-000000000001", request_id: "b1000000-0000-4000-8000-000000000002", supplier_id: "b1000000-0000-4000-8000-000000000003", invoice_number: " INV-01 ", invoice_date: "2026-10-29", total_amount: "100.50", ...patch })) if (value !== undefined) data.set(key, value);
  return data;
}
test("money uses exact cents, payment status covers zero/partial/paid", () => {
  assert.equal(moneyCents("0.29"), 29);
  assert.equal(moneyCents("999999999999.99"), 99999999999999);
  assert.equal(paymentStatus(10050, 0), "unpaid");
  assert.equal(paymentStatus(10050, 1), "partial");
  assert.equal(paymentStatus(10050, 10050), "paid");
  for (const value of ["-1", "1.234", "1e3", "Infinity", "", "1000000000000", null]) assert.throws(() => moneyCents(value));
});
test("draft validates required fields, real calendar dates, positive totals and payment bounds", () => {
  const parsed = parseInvoiceForm(form(), false);
  assert.equal(parsed.payload.invoice_number, "INV-01");
  assert.equal(parsed.payload.paid_amount, "0.00");
  assert.equal(parsed.version, null);
  for (const patch of [{ invoice_number: " " }, { invoice_date: "2026-02-30" }, { invoice_date: "0000-01-01" }, { total_amount: "0" }, { paid_amount: "100.51" }, { paid_amount: "-1" }, { supplier_id: "bad" }, { request_id: "bad" }]) assert.throws(() => parseInvoiceForm(form(patch), false));
  assert.equal(parseInvoiceForm(form({ paid_amount: "100.5", version: "2" }), true).version, 2);
  assert.throws(() => parseInvoiceForm(form({ version: "0" }), true));
});
test("document validates size, declared MIME, extension and magic bytes", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4\nfixture");
  assert.equal(validateInvoiceFile({ name: "invoice.pdf", type: "application/pdf", size: pdf.length }, pdf).extension, "pdf");
  const png = new Uint8Array([137,80,78,71,13,10,26,10]);
  assert.equal(validateInvoiceFile({ name: "invoice.PNG", type: "image/png", size: png.length }, png).type, "image/png");
  for (const file of [{ name: "invoice.jpg", type: "image/jpeg", size: pdf.length }, { name: "invoice.html", type: "application/pdf", size: pdf.length }, { name: "invoice.pdf", type: "application/pdf", size: MAX_INVOICE_FILE_BYTES + 1 }, { name: "invoice.pdf", type: "application/pdf", size: 0 }]) assert.throws(() => validateInvoiceFile(file, pdf));
  assert.throws(() => validateInvoiceFile({ name: "invoice.pdf", type: "application/pdf", size: 4 }, new TextEncoder().encode("fake")));
});
