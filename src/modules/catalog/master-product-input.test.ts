import assert from "node:assert/strict";
import test from "node:test";
import { createMasterProductRequest, parseMasterProductInput } from "./master-product-input";
import { buildCashierProductResults } from "./search";

const category_id = "a1000000-0000-4000-8000-000000000001";
const subcategory_id = "a2000000-0000-4000-8000-000000000001";
const valid = { sku: " MASTER-01 ", name: " Produk ", base_unit: "Tablet", category_id, subcategory_id };

test("master defaults to minimum 5 with unknown cost, no sale unit, price, or batch payload", () => {
  const input = parseMasterProductInput(valid);
  assert.equal(input.minimum_stock, 5);
  assert.equal(input.cost_price, null);
  assert.equal(input.sku, "MASTER-01");
  assert.equal(input.default_supplier_id, null);
  for (const key of ["selling_price", "initial_stock", "barcode", "storage_location_id"]) assert.equal(key in input, false);
});

test("form builder includes only master fields even when legacy fields are injected", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...valid, selling_price: "1000", initial_quantity: "50", add_initial_stock: "on", drug_classification: "otc", minimum_stock: "5" })) form.set(key, value);
  const request = createMasterProductRequest(form, category_id, subcategory_id);
  assert.equal(request.minimum_stock, 5);
  assert.equal("selling_price" in request, false);
  assert.equal("initial_stock" in request, false);
  assert.equal(parseMasterProductInput(request).cost_price, null);
});

test("master validates minimum stock, required data, classification, and supplier UUID", () => {
  for (const minimum_stock of [-1, 0.5, null, "5", NaN, 2147483648]) assert.throws(() => parseMasterProductInput({ ...valid, minimum_stock }));
  for (const patch of [{ sku: " " }, { name: " " }, { category_id: "bad" }, { subcategory_id: "bad" }, { base_unit: "" }, { drug_classification: "bad" }, { default_supplier_id: "bad" }]) assert.throws(() => parseMasterProductInput({ ...valid, ...patch }));
  assert.equal(parseMasterProductInput({ ...valid, minimum_stock: 0 }).minimum_stock, 0);
});

test("master endpoint rejects price, stock, barcode, and activation overrides", () => {
  for (const key of ["selling_price", "cost_price", "initial_stock", "barcode", "is_active", "storage_location_id", "tax_rate"]) assert.throws(() => parseMasterProductInput({ ...valid, [key]: 0 }));
});

test("a master without selling units has no sellable unit even if stock is later present", () => {
  const [product] = buildCashierProductResults([{ id: "master", sku: "M", name: "Master", requires_prescription: false, product_units: [] }], [{ product_id: "master", quantity: 100 }]);
  assert.deepEqual(product.units, []);
});
