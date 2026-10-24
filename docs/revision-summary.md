# Revision Summary — Current Pilot 1 State

## Architecture and database hardening

Pilot 1 is a Next.js modular monolith with Supabase PostgreSQL/Auth/Storage.
Critical checkout, payment, void, return, stock-opname, and cash-drawer
changes are atomic PostgreSQL RPC workflows; the browser has no direct
operational-table or protected-RPC authority.

The checked-in local schema consists of migrations `0001` through `0005`.
Migration `0005_transaction_item_receipt_snapshots.sql` adds immutable
transaction-time product and unit labels. It backfills legacy rows from the
master-data labels available when the migration runs, so it cannot recreate
labels that had already been renamed.

## Implemented Pilot 1 flow

- Server authorization resolves `auth.users -> user_profiles -> employees` and
  uses `employees.position` (`owner_admin`, `kasir`, `staf`).
- Cashier product search is name/SKU based, with multi-unit cart, stock preview,
  prescription checks, cash checkout, and manual QRIS confirmation.
- QRIS means the pharmacy's external/physical counter QRIS. It is manual,
  gateway-free, webhook-free, and does not require an in-app QRIS image.
- Receipts read stored financial fields and label snapshots, show pending/void
  status clearly, and use the browser print dialog. Native thermal printing is
  deferred.
- Return and stock-opname backend workflows exist, while their full operational
  UI workflows remain planned.

## Verification and remaining operational work

The latest local baseline recorded 104 passing application tests, 117 passing
database tests, and 21 concurrency scenario groups / 210 runs with 486
invariant checks, zero deadlocks, and zero lock timeouts.

Remote migration/deployment verification, backup/restore, monitoring,
idempotent checkout recovery, barcode workflow, native printer integration,
master-data UI, and reporting remain backlog rather than evidence of a broken
implemented flow.
