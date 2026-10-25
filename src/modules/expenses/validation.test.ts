import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseExpense, parseExpenseList } from "./validation";

const valid = { expense_date: "2026-02-28", category: "  Sewa  ", description: "  Bulanan  ", amount: "123456789012.34" };
test("valid expense retains precise decimal value and trims text", () => {
  const result = parseExpense(valid);
  assert.equal(result.amount.toFixed(2), valid.amount);
  assert.equal(result.category, "Sewa");
  assert.equal(result.description, "Bulanan");
});
test("nullable description matches the existing table", () => assert.equal(parseExpense({ ...valid, description: " " }).description, null));
test("rejects invalid amounts, dates, identity and missing category", () => {
  for (const amount of ["0", "-1", "1.001", "1000000000000", 12.34]) assert.throws(() => parseExpense({ ...valid, amount }));
  assert.throws(() => parseExpense({ ...valid, expense_date: "2026-02-30" }));
  assert.throws(() => parseExpense({ ...valid, category: " " }));
  assert.throws(() => parseExpense({ ...valid, created_by: "other" }));
});
test("validates date filters and bounded pagination", () => {
  assert.deepEqual(parseExpenseList(new URLSearchParams("from=2026-01-01&to=2026-01-31&page=2&page_size=10")), { from: "2026-01-01", to: "2026-01-31", page: 2, pageSize: 10 });
  for (const input of ["from=2026-02-30&to=2026-03-01", "from=2026-03-01&to=2026-01-01", "page=0", "page_size=101"]) assert.throws(() => parseExpenseList(new URLSearchParams(input)));
});
