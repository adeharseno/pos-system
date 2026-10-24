import assert from "node:assert/strict";
import test from "node:test";
import { createProductRequest } from "./product-create-request";

function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }

test("product create request normalizes text, numbers, booleans, nullable IDs, and leading-zero barcode", () => {
  const request = createProductRequest(form({ sku: " SKU-01 ", name: " Parasetamol ", base_unit: " Tablet ", selling_price: "1000", cost_price: "500", tax_rate: "11", minimum_stock: "3", barcode: "001234567890", default_supplier_id: "", storage_location_id: "storage-id", drug_classification: "prescription_required", is_taxable: "on", is_active: "on" }), "category-id", "subcategory-id");
  assert.equal(request.barcode, "001234567890"); assert.equal(typeof request.selling_price, "number"); assert.equal(request.is_taxable, true); assert.equal(request.default_supplier_id, null); assert.equal(request.storage_location_id, "storage-id"); assert.equal(request.drug_classification, "prescription_required");
});
test("product create request preserves invalid numeric input for server validation", () => assert.equal(Number.isNaN(createProductRequest(form({ selling_price: "invalid" }), "category", "subcategory").selling_price), true));
