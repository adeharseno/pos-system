import assert from "node:assert/strict";
import test from "node:test";

import { subcategoryFormError } from "./subcategory-form-rules";

test("a subcategory with a name passes validation", () => {
  assert.deepEqual(subcategoryFormError("Tablet"), {});
  assert.deepEqual(subcategoryFormError("  Tablet  "), {});
});

test("a missing subcategory name is attributed to the name field only", () => {
  const errors = subcategoryFormError("");
  assert.deepEqual(Object.keys(errors), ["name"]);
  assert.match(errors.name!, /subkategori/i);
  assert.equal("category" in errors, false);
});

test("the legacy category-required error is never produced by the subcategory form", () => {
  for (const name of ["", "   "]) {
    const errors = subcategoryFormError(name);
    assert.equal("categoryId" in errors, false);
    assert.doesNotMatch(errors.name ?? "", /Kategori wajib dipilih/);
  }
});
