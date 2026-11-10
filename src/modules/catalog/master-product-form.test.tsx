import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ProductCreateForm } from "./components/product-create-form";
import { EditProductForm } from "./components/edit-product-form";

test("master form renders requested fields, minimum five, and only bottom actions", () => {
  const router: AppRouterInstance = { bfcacheId: "test", push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
  const html = renderToStaticMarkup(<AppRouterContext.Provider value={router}><ProductCreateForm categories={[{ id: "category", name: "Obat" }]} subcategories={[]} suppliers={[{ id: "supplier", name: "Pemasok A" }]} /></AppRouterContext.Provider>);
  for (const id of ["sku", "name", "manufacturer", "description", "category_id", "subcategory_id", "drug_classification", "base_unit", "minimum_stock", "default_supplier_id"]) assert.ok(html.includes(`id="${id}"`), id);
  for (const name of ["selling_price", "cost_price", "tax_rate", "margin", "storage_location_id", "initial_quantity", "initial_expired_date", "barcode", "is_active", "is_taxable"]) assert.ok(!html.includes(`name="${name}"`), name);
  assert.ok(!html.includes("Kena Pajak"));
  assert.match(html, /id="minimum_stock"[^>]*value="5"/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.ok(html.indexOf('id="default_supplier_id"') < html.indexOf(">Batal</button>"));
  assert.ok(html.includes("Pemasok A"));
  assert.ok(html.includes("belum dapat dijual"));
});

test("edit product form removes Kena Pajak checkbox and never exposes is_taxable input", () => {
  const router: AppRouterInstance = { bfcacheId: "test", push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <EditProductForm
        id="prod-1"
        product={{ sku: "P-1", name: "Paracetamol", isTaxable: true, taxRate: 11 }}
        master={{ categories: [], subcategories: [], suppliers: [], locations: [], taxes: [] }}
      />
    </AppRouterContext.Provider>
  );
  assert.ok(!html.includes("Kena Pajak"));
  assert.ok(!html.includes('name="is_taxable"'));
});
