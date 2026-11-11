import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthApplicationError } from "@/modules/auth/errors";
import { CustomerReturnRequestForm } from "@/modules/returns/components/customer-return-request-form";
import { executeApi } from "@/modules/shared/api/response";
import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import { navigationGroups, navigationGroupsForRole } from "@/modules/ui/app-navigation";
import { TransactionModuleTabs } from "@/modules/sales/components/transaction-module-tabs";
import {
  buildReceivablesHref,
  parseReceivableListFilters,
  receivablePaymentMethodLabel,
  receivableStatusPresentation,
} from "./receivables-filters";
import {
  validateClientPaymentAmount,
  validateRecordReceivablePayment,
} from "./receivables-validation";

test("sidebar navigation removes top-level Retur Penjualan and preserves Transaksi for kasir and owner_admin", () => {
  const allTopHrefs = navigationGroups.flatMap((g) => g.items.map((item) => item.href));
  assert.ok(!allTopHrefs.includes("/returns"));
  assert.ok(!allTopHrefs.includes("/transactions/receivables"));
  assert.ok(allTopHrefs.includes("/transactions"));

  const kasirHrefs = navigationGroupsForRole("kasir").flatMap((g) => g.items.map((i) => i.href));
  assert.deepEqual(kasirHrefs, ["/cashier", "/transactions"]);
});

test("TransactionModuleTabs hides Piutang and Retur from kasir and exposes all 3 URL tabs to owner_admin", () => {
  const kasirHtml = renderToStaticMarkup(
    <TransactionModuleTabs current="history" isOwner={false} />
  );
  assert.match(kasirHtml, /href="\/transactions"/);
  assert.doesNotMatch(kasirHtml, /\/transactions\/receivables/);
  assert.doesNotMatch(kasirHtml, /href="\/returns"/);
  assert.doesNotMatch(kasirHtml, /Piutang/);

  const ownerHtml = renderToStaticMarkup(
    <TransactionModuleTabs current="receivables" isOwner={true} />
  );
  assert.match(ownerHtml, /href="\/transactions"/);
  assert.match(ownerHtml, /aria-current="page"[^>]*href="\/transactions\/receivables"/);
  assert.match(ownerHtml, /href="\/returns"/);
  assert.match(ownerHtml, /Riwayat Transaksi/);
  assert.match(ownerHtml, /Piutang/);
  assert.match(ownerHtml, /Retur/);
});

test("parseReceivableListFilters sanitizes dates, sort columns, statuses, and page numbers", () => {
  const defaults = parseReceivableListFilters({});
  assert.deepEqual(defaults, {
    q: undefined,
    dueFrom: undefined,
    dueTo: undefined,
    status: "all",
    sort: "due_date",
    dir: "asc",
    page: 1,
    limit: 20,
  });

  const valid = parseReceivableListFilters({
    q: "  INV-001  ",
    due_from: "2026-11-01",
    due_to: "2026-11-30",
    status: "overdue",
    sort: "outstanding_amount",
    dir: "desc",
    page: "3",
    limit: "50",
  });
  assert.equal(valid.q, "INV-001");
  assert.equal(valid.dueFrom, "2026-11-01");
  assert.equal(valid.dueTo, "2026-11-30");
  assert.equal(valid.status, "overdue");
  assert.equal(valid.sort, "outstanding_amount");
  assert.equal(valid.dir, "desc");
  assert.equal(valid.page, 3);
  assert.equal(valid.limit, 50);

  const sanitized = parseReceivableListFilters({
    due_from: "2026-02-30",
    status: "hacked",
    sort: "drop table",
    page: "-5",
    limit: "999",
  });
  assert.equal(sanitized.dueFrom, undefined);
  assert.equal(sanitized.status, "all");
  assert.equal(sanitized.sort, "due_date");
  assert.equal(sanitized.page, 1);
  assert.equal(sanitized.limit, 100);
});

test("receivable status labels and href builder work consistently", () => {
  assert.equal(receivableStatusPresentation("unpaid").label, "Belum Lunas");
  assert.equal(receivableStatusPresentation("partial").label, "Sebagian");
  assert.equal(receivableStatusPresentation("paid").label, "Lunas");
  assert.equal(receivableStatusPresentation("overdue").label, "Terlambat");

  assert.equal(receivablePaymentMethodLabel("cash"), "Tunai");
  assert.equal(receivablePaymentMethodLabel("qris"), "QRIS");
  assert.equal(receivablePaymentMethodLabel("bank_transfer"), "Transfer Bank");

  const href = buildReceivablesHref(
    parseReceivableListFilters({ q: "Budi", status: "overdue", sort: "due_date", dir: "asc", page: "1" }),
    { page: 2 }
  );
  assert.equal(href, "/transactions/receivables?q=Budi&status=overdue&page=2");
});

test("receivable payment validation rejects zero, negative, overpayment, and invalid methods", () => {
  assert.equal(validateClientPaymentAmount("0", 50000).valid, false);
  assert.equal(validateClientPaymentAmount("-100", 50000).valid, false);
  assert.equal(validateClientPaymentAmount("50001", 50000).valid, false);
  assert.equal(validateClientPaymentAmount("50000", 50000).valid, true);

  const base = {
    requestId: "11111111-1111-4111-8111-111111111111",
    employeeId: "22222222-2222-4222-8222-222222222222",
    receivableId: "33333333-3333-4333-8333-333333333333",
    paymentMethod: "qris" as const,
    amount: 25000,
    paymentDate: "2026-11-11",
    reference: "REF-123",
    notes: "Cicilan",
  };
  const valid = validateRecordReceivablePayment(base);
  assert.equal(valid.amount, 25000);
  assert.throws(() => validateRecordReceivablePayment({ ...base, amount: 0 }));
  assert.throws(() => validateRecordReceivablePayment({ ...base, paymentDate: "2026-13-01" }));
  assert.throws(() =>
    validateRecordReceivablePayment({ ...base, paymentMethod: "tempo" as "cash" })
  );
});

test("receivable API error mapping returns proper HTTP statuses for forbidden, not found, conflict, and overpayment", async () => {
  const kasirRes = await executeApi(async () => {
    throw new AuthApplicationError("FORBIDDEN");
  });
  assert.equal(kasirRes.status, 403);

  const dbForbidden = await executeApi(async () => {
    throw new PosDomainError("UNAUTHORIZED_ADMIN");
  });
  assert.equal(dbForbidden.status, 403);

  const notFoundRes = await executeApi(async () => {
    throw new PosDomainError("RECEIVABLE_NOT_FOUND");
  });
  assert.equal(notFoundRes.status, 404);

  const paidConflict = await executeApi(async () => {
    throw new PosDomainError("RECEIVABLE_ALREADY_PAID");
  });
  assert.equal(paidConflict.status, 409);

  const reqConflict = await executeApi(async () => {
    throw new PosDomainError("RECEIVABLE_PAYMENT_REQUEST_CONFLICT");
  });
  assert.equal(reqConflict.status, 409);

  const overpaymentRes = await executeApi(async () => {
    throw new PosDomainError("RECEIVABLE_OVERPAYMENT");
  });
  assert.equal(overpaymentRes.status, 400);
});

test("CustomerReturnRequestForm renders TEMPO excess refund selector without throwing", () => {
  const html = renderToStaticMarkup(
    <CustomerReturnRequestForm
      transaction={{
        id: "11111111-1111-4111-8111-111111111111",
        invoice: "INV-TEMPO-01",
        payment: "tempo",
        outstandingReceivable: 75000,
        items: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Paracetamol",
            unit: "Strip",
            price: 25000,
            conversion: 10,
            purchasedBase: 20,
            returnedBase: 0,
            remainingBase: 20,
            purchasedUnits: 2,
            returnedUnits: 0,
            remainingUnits: 2,
            exact: true,
          },
        ],
      }}
    />
  );
  assert.match(html, /TEMPO \(Piutang\)/);
  assert.match(html, /Metode Pengembalian Kelebihan Dana/);
});
