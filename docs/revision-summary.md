# Revision Summary — Current Pilot 1 State

**Updated:** 5 November 2026. For the canonical delivery status and backlog,
read `current-status.md`.

## Architecture and database

Pilot 1 remains a Next.js modular monolith backed by Supabase PostgreSQL, Auth,
and Storage. Critical sales, payment, void, return, stock-opname, purchasing
receiving, and supplier-payment workflows use atomic PostgreSQL functions/RPCs.
The browser has no direct operational-table or protected-RPC authority.

The checked-in schema now consists of migrations `0001` through `0033`.
Notable evolution after the original hardened baseline includes product-master
functions, direct receiving, tax and report functions, permission/employee
administration, dashboard analytics, purchase invoices/items/receiving/payments,
username login, removal of cash drawer, independent category/subcategory
lookups, and supplier/batch traceability.

## Implemented Pilot 1 flow

- Auth resolves `auth.users -> user_profiles -> employees`; position authority
  is `employees.position`, with capability presets and employee overrides on
  migrated routes.
- Cashier supports name/SKU search, exact unit barcode lookup, multi-unit cart,
  prescription data, Cash/manual QRIS, FEFO, history, receipt and void.
  `bank_transfer` is recognized by schema/read models but remains disabled in
  cashier checkout pending a complete lifecycle contract.
- QRIS uses the pharmacy's external counter QRIS and manual confirmation; there
  is no gateway, webhook, polling, or required in-app QR image.
- Cash drawer was removed. The transaction log and immutable sale/return records
  provide actor/time/payment auditability without an open-session precondition.
- Product master/import, inventory/detail/direct receiving, operational stock
  opname, customer-return UI, purchasing/receiving/payment, dashboard, expenses,
  reporting, and employee administration are implemented locally.

## Current stabilization work

- Complete permission enforcement across remaining legacy position-only routes.
- Unify the low-stock boundary rule across product/dashboard/inventory.
- Make database/HTTP/browser QA disposable and repeatable.
- Add checkout and customer-return idempotency.
- Move inventory aggregation/filter/pagination to PostgreSQL for larger data.
- Verify remote migration/deployment, backups, monitoring and end-to-end
  operational reconciliation before production use.

Verification counts are intentionally maintained only in `current-status.md` so
they are not copied forward after becoming stale.
