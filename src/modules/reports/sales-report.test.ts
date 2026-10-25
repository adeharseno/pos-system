import { strict as assert } from "node:assert";
import { test } from "node:test";
import { calculateSalesReport, jakartaToday, reportDateBounds, reportPeriod, validateReportPeriod } from "./sales-report";

test("Jakarta period boundaries use local date and Monday-start weeks", () => {
  const now = new Date("2026-01-04T18:00:00Z");
  assert.equal(jakartaToday(now), "2026-01-05");
  assert.deepEqual(reportPeriod("today", now), { from: "2026-01-05", to: "2026-01-05" });
  assert.deepEqual(reportPeriod("week", now), { from: "2026-01-05", to: "2026-01-05" });
  assert.deepEqual(reportPeriod("month", now), { from: "2026-01-01", to: "2026-01-05" });
  assert.deepEqual(reportDateBounds({ from: "2026-01-31", to: "2026-02-01" }), { start: "2026-01-31T00:00:00+07:00", endExclusive: "2026-02-02T00:00:00+07:00" });
  assert.throws(() => validateReportPeriod({ from: "2026-02-30", to: "2026-03-01" }));
});

test("sales and a later-period refund remain in their respective periods", () => {
  const sale = calculateSalesReport([{ subtotal: 1000, tax_amount: 110 }], [], [{ quantity_in_base: 10, cost_price_snapshot: 60 }], []);
  assert.equal(sale.netRevenue, "1000.00");
  assert.equal(sale.grossProfit, "400.00");
  assert.equal(sale.grossMarginPercent, "40.00");
  assert.equal(sale.completedTransactionCount, 1);
  const later = calculateSalesReport([], [{ refund_subtotal: 300, refund_tax_amount: 33 }], [], [{ quantity_in_base: 3, cost_price_snapshot: 60 }]);
  assert.equal(later.netRevenue, "-300.00");
  assert.equal(later.returnedCogs, "180.00");
  assert.equal(later.grossProfit, "-120.00");
  assert.equal(later.refundedTax, "33.00");
  assert.equal(later.completedTransactionCount, 0);
});

test("batch costs, taxes and zero revenue are handled without floating point aggregation", () => {
  const report = calculateSalesReport([{ subtotal: 10.01, tax_amount: 1.11 }], [{ refund_subtotal: 10.01, refund_tax_amount: 1.11 }], [{ quantity_in_base: 3, cost_price_snapshot: 0.1 }], [{ quantity_in_base: 1, cost_price_snapshot: 0.1 }]);
  assert.equal(report.salesTax, "1.11");
  assert.equal(report.cogs, "0.30");
  assert.equal(report.returnedCogs, "0.10");
  assert.equal(report.grossProfit, "-0.20");
  assert.equal(report.grossMarginPercent, null);
});
