import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { InvoiceItemsWorkspace } from "./components/invoice-items-workspace";
import type { InvoiceItem } from "./invoice-item-repository";
import { Modal } from "@/modules/ui/modal";

const router: AppRouterInstance = { bfcacheId: "test", push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const invoice = { id: "invoice", version: 1, invoice_number: "INV-WORKSPACE", invoice_date: "2026-10-29", supplier_id: "supplier", suppliers: { name: "Pemasok A" }, total_amount: 500, document_name: null, purchase_invoice_payments: [] };
function item(id: string, batch: string): InvoiceItem {
  return { id, invoice_id: "invoice", product_id: "product", product_unit_id: null, product_name_snapshot: "Produk Snapshot", sku_snapshot: "SKU-TEST", base_unit_snapshot: "Tablet", unit_name_snapshot: "Tablet", conversion_to_base: 1, cost_price: 100, tax_rate: 11, margin_percent: 20, selling_price: 133, pricing_mode: "selling_price", quantity: 2, batch_number: batch, expired_date: "2030-01-01", subtotal: 222, version: 1, deleted_at: null, created_by: "owner", updated_by: "owner", created_at: "2026-10-29", updated_at: "2026-10-29" };
}
test("workspace renders active invoice before item list, snapshot batches and exact difference", () => {
  const html = renderToStaticMarkup(<AppRouterContext.Provider value={router}><InvoiceItemsWorkspace initialInvoice={invoice} initialItems={[item("one", "BATCH-A"), item("two", "BATCH-B")]} /></AppRouterContext.Provider>);
  assert.ok(html.indexOf("Invoice Aktif") < html.indexOf("Cari Master Produk"));
  for (const text of ["INV-WORKSPACE", "BATCH-A", "BATCH-B", "Rp 444", "-Rp 56", "Tambah Produk Baru", "Lihat / Edit Invoice", "Hapus"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes("xl:grid-cols-"));
  assert.ok(!html.includes("Finalisasi"));
  assert.ok(html.includes("<dialog"), "invoice popup is mounted even while closed");
});
test("persistent modal keeps form DOM while closed; existing modal behavior is unchanged", () => {
  assert.equal(renderToStaticMarkup(<Modal open={false} labelledBy="test" onClose={() => {}}><input defaultValue="draft" /></Modal>), "");
  const persistent = renderToStaticMarkup(<Modal open={false} keepMounted labelledBy="test" onClose={() => {}}><input defaultValue="draft" /></Modal>);
  assert.ok(persistent.includes('value="draft"')); assert.ok(!persistent.includes('open=""'));
});
