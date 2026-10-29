import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { InvoiceForm } from "./components/invoice-form";
import { formatInvoiceAmount } from "./invoice-presentation";

const router: AppRouterInstance = { bfcacheId: "test", push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
test("new invoice form has only invoice fields, searchable supplier, and bottom save", () => {
  const html = renderToStaticMarkup(<AppRouterContext.Provider value={router}><InvoiceForm /></AppRouterContext.Provider>);
  for (const name of ["supplier_id", "invoice_number", "invoice_date", "total_amount", "paid_amount", "document"]) assert.ok(html.includes(`name="${name}"`));
  assert.ok(html.includes('role="combobox"'));
  assert.match(html, /name="paid_amount"[^>]*value="0"/);
  assert.ok(html.includes("Belum Dibayar"));
  assert.ok(html.includes("/products/suppliers"));
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.ok(html.indexOf('name="document"') < html.indexOf('Simpan Invoice'));
  for (const text of ["Simpan &amp; Lanjut", "name=\"product_id\"", "name=\"selling_price\"", "name=\"quantity\""]) assert.ok(!html.includes(text));
});
test("edit form reflects partial payment and preserves attachment information", () => {
  const html = renderToStaticMarkup(<AppRouterContext.Provider value={router}><InvoiceForm invoice={{ id: "invoice", supplier_id: "supplier", suppliers: { name: "Pemasok A" }, version: 2, invoice_number: "INV-1", invoice_date: "2026-10-29", total_amount: 100.5, document_name: "invoice.pdf", purchase_invoice_payments: [{ amount: 25, payment_key: "initial" }] }} /></AppRouterContext.Provider>);
  assert.ok(html.includes("Belum Lunas"));
  assert.ok(html.includes("invoice.pdf"));
  assert.ok(html.includes("Pemasok A"));
  assert.equal(formatInvoiceAmount(100.5), "Rp 100,50");
});
