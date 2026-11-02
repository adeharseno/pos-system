import assert from "node:assert/strict";
import test from "node:test";

import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import { assertActiveSupplierNameAvailable } from "./supplier-name";

const active = [
  { id: "supplier-1", name: "PT Sehat", is_active: true },
  { id: "supplier-2", name: "Apotek Lama", is_active: false },
];

test("a new or edited supplier rejects a name matching another active supplier", () => {
  assert.throws(
    () => assertActiveSupplierNameAvailable("  pt sehat  ", active),
    (error) => error instanceof PosDomainError && error.code === "DUPLICATE_SUPPLIER",
  );
  assert.throws(
    () => assertActiveSupplierNameAvailable("PT SEHAT", active, "supplier-other"),
    (error) => error instanceof PosDomainError && error.code === "DUPLICATE_SUPPLIER",
  );
});

test("the edited row itself and inactive suppliers do not block a name", () => {
  assert.doesNotThrow(() => assertActiveSupplierNameAvailable("PT Sehat", active, "supplier-1"));
  assert.doesNotThrow(() => assertActiveSupplierNameAvailable("Apotek Lama", active));
});
