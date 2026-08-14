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
4. **Customer returns are cumulative.** Previous returns must be included when checking the remaining returnable quantity.
5. **Customer returns restore original sale allocation batches** and snapshot refunds/COGS reversal.
6. **A transaction with an existing customer return cannot be voided** in Pilot 1.
7. **Checkout validates cash-drawer ownership** against the authenticated employee and requires the session to be open.
8. **Invoice numbers are generated DB-side inside checkout** using a concurrency-safe daily sequence.
9. **Business timezone is Asia/Jakarta.** Store timestamps as UTC, but use WIB business dates for invoice/report/day boundaries.
10. **Transactional tables are server-only.** Never expose `SUPABASE_SERVICE_ROLE_KEY`; browser database access to operational tables is denied by RLS.
11. **Role model stays simple**: Supabase Auth `app_metadata.role` = `owner_admin` | `kasir`. Do not create granular RBAC tables in Pilot 1.
12. **Stock opname is batch-level with operational freeze** in Pilot 1; `physical_quantity` is nullable until counted, only one session may be `in_progress`, frozen batches reject normal stock mutations, and apply is blocked while any item is uncounted.
13. **Cash refunds use the current refund drawer**, never the original transaction drawer. The drawer must be open and owned by the authenticated processor.
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

- Architecture and schema documentation have completed a second hardening pass based on concurrency/integrity review.
- `0001_init.sql` and `0002_rls_policies.sql` have been updated to the hardened data model.
- Local Supabase CLI configuration is available. Remote project linking remains
  developer-local and must never commit credentials.
- `0001_init.sql` and `0002_rls_policies.sql` have been applied successfully by
  a clean local `supabase db reset`, catalog-verified, and schema-linted. The
  remote Supabase project is not linked yet.
- `0003_core_functions.sql` is **planned but not yet implemented**; it must contain the atomic RPCs before cashier transaction coding is considered complete.
- M1.1 application foundation is implemented: Next.js App Router, strict
  TypeScript, Tailwind CSS, ESLint, modular domain directories, and foundational
  Supabase browser/server/admin client factories.
- Authentication flows, database queries, API routes, and business features are
  not implemented yet.

Start with `docs/roadmap.md` M1. Do not skip the database concurrency tests listed there.
