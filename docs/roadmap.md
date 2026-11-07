# Implementation Roadmap — Pharmacy POS Pilot 1

**Updated:** 5 November 2026
**Canonical status:** `docs/current-status.md`

This roadmap is organized by current capability rather than the historical
order in which commits were delivered. Detailed phase documents remain useful
as implementation records but do not define current status.

## Completed locally

| Capability | Status | Verified scope |
|---|---|---|
| Foundation and architecture | COMPLETE | Next.js App Router modular monolith, strict TypeScript, Tailwind, server-only Supabase clients. |
| Database foundation | COMPLETE LOCALLY | Migrations `0001`–`0033`, RLS defense-in-depth, relational constraints, Jakarta business dates. |
| Core sales RPCs | COMPLETE | Atomic FEFO checkout, QRIS confirmation, void, returns, transaction log, and stock-opname lifecycle. |
| Authentication | COMPLETE | Email/username login, employee mapping, activation, account lifecycle, logout. |
| Employee management | COMPLETE | CRUD, roles, invitations and permission overrides. Full cross-route permission enforcement remains a stabilization item. |
| Cashier | COMPLETE FOR ACTIVE METHODS | Search, exact barcode lookup, multi-unit cart, prescription input, Cash and manual QRIS. Bank Transfer remains disabled. |
| Receipt and history | COMPLETE | Immutable snapshots, browser print/reprint, history/detail/filter, read-only log. |
| Customer returns | COMPLETE | Partial/cumulative multi-item UI and atomic refund/original-batch restoration. |
| Product master | COMPLETE | Product lifecycle, selling units/barcodes, categories, independent subcategories, suppliers, taxes, XLSX/CSV import. |
| Inventory | COMPLETE FOR PILOT | Overview/detail, direct receiving, batches/expiry, stock-opname counting/apply/cancel. Scalability work remains. |
| Purchasing | COMPLETE FOR PILOT | Draft invoices, items, documents, atomic receiving finalization, payment ledger/history. |
| Dashboard and reports | COMPLETE FOR PILOT | Analytics, low-stock summary, sales/margin/product/payment/refund/P&L reports and expenses. |
| Cash drawer | REMOVED | Removed by migration `0031`; transaction log replaces drawer attribution. |

## Stabilization — next development focus

1. Complete capability-based permission enforcement across every protected page,
   route handler, action, and navigation entry.
2. Resolve the low-stock boundary mismatch (`< minimum` versus `<= minimum`)
   and add a shared contract test.
3. Make pgTAP/concurrency/HTTP tests disposable and repeatable; standardize the
   project Node runtime and add authenticated browser smoke tests.
4. Add checkout and customer-return idempotency/recovery for uncertain responses.
5. Move inventory overview aggregation, filtering, and pagination into SQL and
   benchmark representative catalog/batch volumes.
6. Complete mobile/desktop, accessibility, slow-network, double-submit, and
   pharmacy reconciliation QA.
7. Decide and implement the Bank Transfer lifecycle before enabling its cashier
   control; database/read models currently recognize it, but checkout UX does not.

## Production-readiness gate

Before live pharmacy use, all of the following must be explicitly verified:

- Remote migration parity and deployment configuration.
- Auth redirect/origin configuration and storage policies.
- Backup, restore, monitoring, alerting, and operational recovery.
- Hosting quotas, commercial terms, and representative load tests.
- End-to-end reconciliation of purchasing, stock, sales, returns, expenses,
  tax, gross profit, and profit/loss.
- A supported runtime and repeatable CI pipeline.

## Deferred / later pilot

- Dynamic QRIS/payment gateway, webhooks and automatic reconciliation.
- Offline mode, multi-outlet, native thermal-printer integration.
- Formal purchase orders and approval workflows.
- Payroll, loyalty/CRM, and dedicated supplier-return UI.

## Verification snapshots

- 5 November 2026: ESLint passed; 255 TypeScript unit/component tests passed;
  production Webpack build and post-build typecheck passed.
- 30 October 2026 isolated audit: 23 pgTAP files / 373 tests passed; core
  concurrency 23 groups / 230 runs / 530 checks passed; purchasing concurrency
  and receiving finalization suites passed.

These counts are evidence snapshots, not a release guarantee. Browser E2E and
remote production verification are still required.
