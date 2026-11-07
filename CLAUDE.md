# CLAUDE.md — Pharmacy POS Project Context (Pilot 1)

Entry point for AI/coding agents working in this repo. Read this file before implementation. Detailed docs are in `docs/`; use the source-of-truth file relevant to the task.

## Project Summary

Pharmacy POS Pilot 1 focused on cashier operations, multi-unit products, multi-batch FEFO inventory, prescription requirements, returns, stock opname, and basic reporting.

The architecture is intentionally a **modular monolith**:

- Next.js App Router: frontend + HTTP/backend boundary
- Vercel: one application deployment
- Supabase PostgreSQL: relational database and atomic transaction functions
- Supabase Auth: authentication
- Supabase Storage: images/documents

Do **not** introduce microservices, a separate Express/Nest/Go backend, queues, or extra infrastructure unless requirements explicitly change.

## Critical Rules

1. **Critical stock mutations are PostgreSQL transactions/RPCs.** Checkout, QRIS confirmation, void, returns, and stock-opname apply must not be implemented as several independent `supabase.from()` calls and assumed to be atomic.
2. **`transaction_items` is one row per customer-facing cart/receipt line.** FEFO sources belong in `transaction_item_batches` (1..N per item).
3. **QRIS checkout starts as `pending_payment`.** It becomes `completed` only after manual confirmation. Pending QRIS does not count as completed revenue.
   Pending QRIS may be voided, but confirmed QRIS cannot be voided and must use customer return/refund for reversal.
4. **Customer returns are cumulative.** Previous returns must be included when checking the remaining returnable quantity.
5. **Customer returns restore original sale allocation batches** and snapshot refunds/COGS reversal.
6. **A transaction with an existing customer return cannot be voided** in Pilot 1.
7. **Checkout records a read-only transaction log** with the server-derived employee, timestamp, payment method, totals, and immutable line snapshots. There is no cash-drawer precondition.
8. **Invoice numbers are generated DB-side inside checkout** using a concurrency-safe daily sequence.
9. **Business timezone is Asia/Jakarta.** Store timestamps as UTC, but use WIB business dates for invoice/report/day boundaries.
10. **Transactional tables are server-only.** Never expose `SUPABASE_SERVICE_ROLE_KEY`; browser database access to operational tables is denied by RLS.
11. **Identity and role authority stays simple**: resolve `auth.users -> user_profiles -> employees`; `employees.position` is the role authority (`owner_admin` | `kasir` | `staf`). Do not use Auth `app_metadata` as application authority. Capability definitions, role presets, and employee allow/deny overrides now exist; use the shared permission policy for migrated routes and do not invent a second authorization model. Some legacy routes remain role-only and are tracked in `docs/current-status.md`.
12. **Stock opname is batch-level with operational freeze** in Pilot 1; `physical_quantity` is nullable until counted, only one session may be `in_progress`, frozen batches reject normal stock mutations, and apply is blocked while any item is uncounted.
13. **Cash refunds are recorded in the transaction log** with employee, timestamp, and reason; there is no refund-drawer attribution.
14. **Product/unit/batch consistency is enforced by composite foreign keys**, not only by RPC validation.
15. **Payment lifecycle shape is enforced by database checks** in addition to RPC state-transition locking.
16. **Checkout inserts the transaction header before transaction items** after authoritative totals and invoice number are calculated, so foreign-key order is valid.

## When to Read Which File

| Working on... | Read |
|---|---|
| Architecture/deployment/module boundaries | `docs/architecture.md` |
| Tables/relations/RLS/integrity | `docs/database-design.md` |
| API endpoints and payloads | `docs/api-contract.md` |
| Checkout/QRIS/void/returns/opname/report algorithms | `docs/business-logic.md` |
| File placement/module structure/env | `docs/folder-structure.md` |
| Product scope/requirements | `docs/prd.md` |
| Implementation order/test gates | `docs/roadmap.md` |

## Implementation Status

- The active schema is migrations `0001` through `0033`; do not assume the
  original `0001`–`0005` baseline describes the current database.
- Implemented modules include authentication/employees, catalog/import,
  cashier/transactions/returns, inventory/opname, purchasing/receiving/payment,
  dashboard, expenses, and reports.
- Cash drawer was removed in `0031_remove_cash_drawer.sql`; do not reintroduce a
  drawer precondition without a new approved requirement.
- Remote migration/deployment verification remains backlog. Supabase linking is
  developer-local and credentials must never be committed.
- Database tests require local Supabase and should be run against disposable or
  known-clean fixtures; concurrency tests remain mandatory for critical RPC work.
- Read `docs/current-status.md` before planning work. It is the canonical status
  and backlog; `docs/roadmap.md` is the milestone view.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
