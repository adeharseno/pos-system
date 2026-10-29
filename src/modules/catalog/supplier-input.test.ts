import assert from "node:assert/strict";
import test from "node:test";
import { parseSupplierInput } from "./supplier-input";
test("supplier input trims fields and preserves phone formatting", () => {
  assert.deepEqual(parseSupplierInput({ name: " PT Sehat ", phone: " +62 0812-000 ", address: " Jalan Baru ", manufacturer: "Ignored", is_active: false }), { name: "PT Sehat", phone: "+62 0812-000", address: "Jalan Baru" });
});
test("supplier optional values become null", () => {
  assert.deepEqual(parseSupplierInput({ name: "Pemasok", phone: " ", address: null }), { name: "Pemasok", phone: null, address: null });
});
test("supplier rejects missing names, wrong types and oversized fields", () => {
  for (const value of [null, [], "name", {}, { name: " " }, { name: 1 }, { name: "A", phone: 123 }, { name: "A", address: {} }, { name: "A".repeat(201) }, { name: "A", phone: "1".repeat(51) }, { name: "A", address: "A".repeat(1001) }]) assert.throws(() => parseSupplierInput(value));
});
