# Current Project Status

**Last documentation review:** 5 November 2026  
**Code baseline:** `0027aec` (`main`)  
**Purpose:** canonical implementation-status reference for development planning.

This file describes what exists in the repository today. Product intent remains
in `prd.md`; architectural invariants remain in `architecture.md`; detailed
workflows remain in `business-logic.md`. Phase documents record how individual
features were delivered and must not be used as the current backlog.

## Executive status

The application is a working local Pharmacy POS modular monolith with cashier,
catalog, inventory, purchasing, reporting, expenses, dashboard, and employee
administration. Core stock and financial mutations are implemented as atomic
PostgreSQL RPCs. The local implementation is suitable for continued pilot
development, but it is not yet certified for production operation.

## Implemented application areas

| Area | Current implementation |
|---|---|
| Authentication | Email or username login, active-employee mapping, invitation/activation, logout, role and permission policies. |
| Employee administration | Employee CRUD/account lifecycle, role changes, invitations, and individual permission overrides. |
| Cashier | Name/SKU search, exact barcode lookup, multi-unit cart, prescription fields, and Cash/QRIS checkout. |
| Payment lifecycle | Cash completes at checkout; QRIS starts pending and requires manual confirmation. `bank_transfer` exists in database/read models, but cashier selection is disabled and is not an operational checkout method. |
| Transactions | History, filters, detail, immutable receipt snapshots, browser printing, void rules, and transaction log. |
| Returns | Customer-return UI and atomic cumulative refund/restoration flow. Supplier-return backend exists; no dedicated supplier-return UI. |
| Product master | List/detail/create/edit/deactivate, units/barcodes, categories, independent subcategories, suppliers, tax master, CSV/XLSX import. |
| Inventory | Overview/detail, direct stock receiving, batch/expiry tracking, and operational stock-opname count/apply/cancel UI. |
| Purchasing | Purchase-invoice list/create/edit, item workspace, document upload, atomic receiving finalization, payment ledger and history. |
| Reporting | Sales/gross-profit, product performance, payment/refund, profit/loss, and expense recording. |
| Dashboard | Permission-aware financial/stock summary, charts, low-stock list, and quick actions. |

## Current database baseline

- Checked-in migrations: `0001_init.sql` through
  `0033_supplier_legacy_and_batch_traceability.sql`.
- Cash drawer was deliberately removed by migration `0031_remove_cash_drawer.sql`.
  Checkout and cash refunds have no drawer-session precondition; auditability is
  provided by immutable transaction/return records and the transaction log.
- The role authority is `employees.position` (`owner_admin`, `kasir`, `staf`).
  Permission definitions, role presets, and employee overrides exist, but some
  legacy routes still enforce role-only guards.
- Remote migration parity, deployment, backup/restore, and monitoring are not
  verified by this repository review.

## Verification baseline

Verified on 5 November 2026 without changing application source:

- ESLint passed.
- 255 TypeScript unit/component tests passed.
- Next.js production build with Webpack passed, including TypeScript validation
  and generation of 46 static pages.
- Standalone `typecheck` passed after the production build regenerated `.next`
  route types. A stale `.next` directory can otherwise reference removed routes.

The most recent isolated database audit remains 30 October 2026:

- 23 pgTAP files / 373 tests passed on an isolated database clone.
- Core RPC concurrency: 23 scenario groups / 230 runs / 530 checks passed.
- Purchase receiving and purchase payment concurrency tests passed.
- These are historical verification snapshots, not a release guarantee.

## Confirmed gaps and development priorities

1. **Permission enforcement:** migrate remaining legacy role-only page/API
   guards to the documented capability model and test role × override × route.
2. **Low-stock rule:** product/dashboard use `< minimum`, while inventory uses
   `<= minimum`; choose one rule and use it everywhere.
3. **Repeatable QA:** run database tests against disposable fixtures, standardize
   the supported Node runtime, and add authenticated HTTP/browser smoke tests.
4. **Submission recovery:** checkout and customer returns still need explicit
   idempotency keys for safe retry after an uncertain network response.
5. **Inventory scalability:** inventory overview fetches all products,
   categories, and active batches in chunks, then filters/paginates in Next.js.
   Move aggregation/filter/pagination to PostgreSQL before large datasets.
6. **Production readiness:** verify remote migration parity, environment and
   origin configuration, storage policies, backups, monitoring, hosting limits,
   and recovery procedures.
7. **Operational QA:** perform complete desktop/mobile browser journeys,
   accessibility checks, slow-network/double-submit checks, and reconciliation
   against representative pharmacy data.
8. **Bank-transfer lifecycle:** either finish an authoritative confirmation/
   completion workflow or remove the premature option from the operational
   contract; the current cashier correctly keeps it disabled.

## Explicitly deferred / out of scope

- Payment gateway, dynamic QRIS, webhook/polling, and automatic reconciliation.
- Offline mode and multi-outlet operation.
- Native ESC/POS/WebUSB printing; browser printing is the current contract.
- Formal purchase-order/approval workflow.
- Payroll and loyalty/CRM.
- Dedicated supplier-return UI.

## Documentation authority

When documents disagree, use this order:

1. Executable migrations, tests, and application code.
2. `current-status.md` for implementation status and backlog.
3. `architecture.md`, `database-design.md`, `business-logic.md`, and
   `api-contract.md` for active technical contracts.
4. `prd.md` for product intent and scope.
5. Phase/redesign/audit documents as dated historical evidence.
