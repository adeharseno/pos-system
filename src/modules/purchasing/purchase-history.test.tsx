import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentStatusBadge } from "./components/payment-status-badge";
import { parsePurchaseHistoryFilters, parsePurchasePayment, purchaseHistoryRange } from "./purchase-history";

test("purchase history filters paginate and sanitize search", () => {
  assert.deepEqual(parsePurchaseHistoryFilters({ q: " Pemasok A ", page: "3" }), { q: "Pemasok A", page: 3, limit: 20 });
  assert.deepEqual(parsePurchaseHistoryFilters({ q: "or(id.eq.x)", page: "0" }), { q: "", page: 1, limit: 20 });
  assert.deepEqual(purchaseHistoryRange({ q: "", page: 3, limit: 20 }), { from: 40, to: 59 });
});

test("purchase payment validates positive money, date, and retry key", () => {
  const parsed = parsePurchasePayment({ request_id: "550e8400-e29b-41d4-a716-446655440000", amount: "25.50", payment_date: "2026-10-29" });
  assert.equal(parsed.amount, "25.50");
  for (const value of [{ ...parsed, amount: "0" }, { ...parsed, amount: "-1" }, { ...parsed, payment_date: "2026-02-30" }, { ...parsed, request_id: "bad" }]) assert.throws(() => parsePurchasePayment(value));
});

test("payment badges distinguish unpaid, partial, and paid", () => {
  assert.match(renderToStaticMarkup(<PaymentStatusBadge totalCents={10000} paidCents={0}/>), /Belum Dibayar/);
  assert.match(renderToStaticMarkup(<PaymentStatusBadge totalCents={10000} paidCents={5000}/>), /Belum Lunas/);
  assert.match(renderToStaticMarkup(<PaymentStatusBadge totalCents={10000} paidCents={10000}/>), /Lunas/);
});
