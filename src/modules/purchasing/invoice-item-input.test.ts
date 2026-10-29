import assert from "node:assert/strict";
import test from "node:test";
import { blankItemFields, changeItemPrice, fieldsForProduct, formatItemCents, itemSubtotalCents, parseInvoiceItem, type InvoiceProduct } from "./invoice-item-input";

const product: InvoiceProduct = { id: "c1000000-0000-4000-8000-000000000001", sku: "SKU", name: "Produk", baseUnit: "Tablet", costPrice: 1000, taxRate: 11, previousExpiry: "2027-01-01", units: [{ id: "c2000000-0000-4000-8000-000000000001", name: "Strip", conversion: 10, sellingPrice: 13320 }] };
const fields = () => ({ ...fieldsForProduct(product, product.units[0].id), quantity: "2", batch_number: " B-1 ", expired_date: "2027-01-01", expiry_confirmed: true });
test("reference prices use selected unit, expiry is never copied or confirmed automatically", () => {
  const values = fieldsForProduct(product, product.units[0].id);
  assert.equal(values.cost_price, "10000"); assert.equal(values.selling_price, "13320"); assert.equal(values.margin_percent, "20");
  assert.equal(values.expired_date, ""); assert.equal(values.expiry_confirmed, false);
});
test("unpriced master leaves prices empty and uses only an invoice base-unit snapshot", () => {
  const values = fieldsForProduct({ ...product, costPrice: null, units: [{ id: null, name: "Tablet", conversion: 1, sellingPrice: null }] }, null);
  assert.equal(values.cost_price, ""); assert.equal(values.selling_price, ""); assert.equal(values.product_unit_id, null);
  assert.throws(() => parseInvoiceItem({ ...values, quantity: "1", expired_date: "2027-01-01", expiry_confirmed: true, batch_number: "B" }, "2026-10-29"));
});
test("price changes reuse existing pricing and server ignores conflicting calculated price/margin", () => {
  const margin = changeItemPrice(fields(), "margin_percent", "30");
  assert.equal(margin.selling_price, "14430");
  const result = parseInvoiceItem({ ...margin, selling_price: "1" }, "2026-10-29");
  assert.equal(result.selling_price, "14430.00");
  const selling = parseInvoiceItem({ ...fields(), selling_price: "11100", margin_percent: "99999" }, "2026-10-29");
  assert.equal(Number(selling.margin_percent), 0);
  const zeroCost = parseInvoiceItem({ ...fields(), cost_price: "0", selling_price: "1" }, "2026-10-29");
  assert.equal(zeroCost.margin_percent, null);
  assert.equal(parseInvoiceItem({ ...fields(), cost_price: "12.50", tax_rate: "0", margin_percent: "16", pricing_mode: "margin" }, "2026-10-29").selling_price, "14.00", "preserves existing helper rounding at binary floating point boundary");
});
test("validation requires expiry confirmation and rejects bad quantities/prices/batches/tax", () => {
  for (const patch of [{ expiry_confirmed: false }, { expired_date: "2026-02-30" }, { expired_date: "2026-10-28" }, { quantity: "0" }, { quantity: "1.5" }, { cost_price: "" }, { cost_price: "-1" }, { selling_price: "" }, { tax_rate: "100.01" }, { batch_number: " " }, { product_unit_id: "bad" }]) assert.throws(() => parseInvoiceItem({ ...fields(), ...patch }, "2026-10-29"));
  assert.equal(parseInvoiceItem(fields(), "2026-10-29").batch_number, "B-1");
  assert.equal(blankItemFields().pricing_mode, "selling_price");
});
test("purchase subtotals include tax and use exact cents independent of sale price", () => {
  assert.equal(itemSubtotalCents("10000", "2", "11"), BigInt(2220000));
  assert.equal(itemSubtotalCents("0.01", "1", "50"), BigInt(2));
  assert.equal(formatItemCents(BigInt(-2220000)), "-Rp 22.200");
  assert.equal(formatItemCents(BigInt(10050)), "Rp 100,50");
});
