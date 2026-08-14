# Implementation Roadmap & Scope Boundaries — Pharmacy POS (Pilot 1)

## M0 — Architecture & Schema Hardening

**Status: architecture/schema hardening round 2 documented; database RPC implementation not started.**

| Item | Decision |
|---|---|
| Architecture | Modular monolith: Next.js + Vercel + Supabase |
| Transaction atomicity | Critical stock mutations move to PostgreSQL RPC/functions |
| Checkout model | `transaction_items` separated from `transaction_item_batches` |
| QRIS | `pending_payment -> completed` manual confirmation |
| Void | Restore allocation stock; reject if customer return exists |
| Customer return | Cumulative return validation + original-batch restoration + refund/COGS snapshots |
| Stock opname | Batch-level operational freeze; nullable physical count; apply/cancel releases freeze |
| Invoice | DB-side daily sequence, Asia/Jakarta business date |
| Cash drawer | Validate active session ownership during checkout and current-drawer ownership for cash refunds |
| Structural integrity | Composite FKs enforce product/unit/batch consistency |
| Payment lifecycle | DB checks reject invalid cash/QRIS/status/void combinations |
| Timezone | UTC timestamps + Asia/Jakarta business-day semantics |
| Deployment | Vercel + Supabase; no custom domain required for pilot/demo |

M0 is considered complete only after the SQL migration and core RPC tests match these documents.

---

## M1 — Foundation & Database

- Scaffold Next.js App Router + TypeScript project.
- Configure Supabase Auth, server/admin/browser clients.
- Apply and test `0001_init.sql`, including composite FKs and lifecycle constraints.
- Apply and test `0002_rls_policies.sql`.
- Implement `0003_core_functions.sql` for atomic workflows.
- Add seed migration.
- Generate Supabase TypeScript database types.
- Add automated DB tests for concurrent checkout, invoice sequencing, return limits, void conflicts, refund-drawer attribution, payment lifecycle constraints, and stock-opname freeze races.

## M2 — Auth, Master Data & Inventory Basics

- Login/session/role guards.
- Categories/subcategories.
- Products and units.
- Suppliers and storage locations.
- Manual batch stock entry.
- Expiry/low-stock queries.

## M3 — Cashier Core

- Cash drawer open/current/close.
- Barcode lookup and cart.
- Checkout UI.
- Atomic FEFO checkout RPC integration.
- Cash payment.
- Receipt payload/printing integration.
- Transaction history/detail.
- Void.

## M4 — QRIS

- QRIS image settings/upload.
- QRIS payment modal.
- `pending_payment` state UI.
- Manual confirm-payment flow.
- Abandoned QRIS -> void/release stock workflow.

## M5 — Returns & Stock Opname

- Customer return with cumulative quantity validation.
- Supplier return.
- Refund snapshots + COGS reversal.
- Batch-level stock opname session/count/apply/cancel with operational freeze.
- Stock card.

## M6 — Reporting & Operations

- Sales report.
- Profit & loss including refunds and COGS reversal.
- Stock valuation.
- Dashboard summary.
- Operational expenses.
- Employees, shifts, attendance.

---

## Definition of Done for Critical Workflows

Before calling Pilot 1 transaction logic complete, test at least:

1. Two concurrent cashiers selling the last units of the same batch cannot oversell.
2. One sell unit split across multiple batches produces one receipt line and multiple batch allocations.
3. Two concurrent checkouts cannot get the same invoice number.
4. QRIS pending transactions do not appear as completed revenue.
5. QRIS confirmation vs void cannot both win.
6. Multiple partial returns cannot exceed the originally sold quantity.
7. Voiding a transaction with an existing customer return is rejected.
8. Customer returns reduce net sales and reverse the appropriate COGS.
9. Stock opname cannot apply with uncounted rows.
10. A cashier cannot use another cashier's drawer session.
11. A cash refund is attributed to the currently-open drawer that pays it, not the original sale drawer.
12. Invalid product/unit/batch combinations are rejected by database foreign keys.
13. Invalid cash/QRIS/payment/void lifecycle combinations are rejected by database constraints.
14. A checkout/return/void cannot mutate a batch frozen by an in-progress stock opname.
15. A sale racing with opname start either completes before the snapshot or is rejected after the freeze; it cannot be silently overwritten on apply.

---

## Intentionally Out of Scope

Pilot 1 does not add:

- microservices
- payment gateway/webhook integration
- multi-branch/outlet model
- granular RBAC/permission matrix
- formal approval workflows
- purchase order/goods receipt workflow
- offline sync
- payroll
- loyalty/CRM

Do not introduce these without an explicit Pilot 2 requirement.
