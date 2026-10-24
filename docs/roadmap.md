# Implementation Roadmap & Scope Boundaries — Pharmacy POS (Pilot 1)

## Verified milestone status

| Milestone | Status | Verified scope |
|---|---|---|
| M1.1 Foundation | COMPLETE | Next.js, TypeScript, lint/build setup, Supabase clients. |
| M1.2 Local schema/migration setup | COMPLETE locally | Migrations `0001`–`0005` reproduce the local schema. Remote migration/deployment verification remains backlog. |
| M1.3 Constraint verification | COMPLETE locally | pgTAP integrity/RLS/lifecycle checks. |
| M1.4 Core atomic RPC | COMPLETE | Checkout, QRIS lifecycle, void, returns, and opname RPCs. |
| M1.5 Concurrency verification | COMPLETE | Deterministic concurrent workflow verification. |
| M1.5.1 QRIS lifecycle hardening | COMPLETE | Pending/confirm/void state rules are database protected. |
| M1.6 Application data layer | COMPLETE | Server-only adapters and typed application services. |
| M2.1 Authentication | COMPLETE | Active employee mapping and position-based authorization. |
| M2.2 Authenticated business API foundation | COMPLETE | Implemented Pilot 1 routes only; see API contract. |
| M2.3 Cash drawer workflow | COMPLETE | Open/current/close and drawer-aware checkout. |
| M2.4 Product search/cart | PARTIAL | Name/SKU search and multi-unit cart complete; barcode workflow remains backlog. |
| M2.4.2 Barcode lookup workflow | COMPLETE | Keyboard-wedge/manual exact unit-barcode lookup into the existing cart. |
| M2.4.1 Responsive UI foundation | COMPLETE | Responsive cashier workspace. |
| M2.5 Cash checkout | COMPLETE | Authoritative cash checkout. |
| M2.6 QRIS manual payment | COMPLETE | External counter QRIS and manual cashier confirmation. |
| M2.7 Receipt | COMPLETE | Authoritative, read-only receipt and browser printing. |
| M2.7.1 Historical receipt snapshot hardening | COMPLETE | Transaction-time product/unit labels; legacy backfill has historical limits. |
| M2.8 Transaction History, Search & Receipt Reprint | COMPLETE | Read-only paginated history, detail, filters, and receipt-route reuse. |
| M2.9 Customer Return Operational Workflow | COMPLETE | Transaction-detail return UI; partial/cumulative multi-item returns, Cash/QRIS support, snapshots, server-owned Cash drawer, and refund preview. |

## Product master milestone

**M2.10 — Product Master Data — COMPLETE**

| Slice | Status | Notes |
|---|---|---|
| M2.10A Product List / Read-only Admin UI | COMPLETE | Server-side list/detail, search, filters, pagination, and stock summary. |
| M2.10B Manual Product Create | COMPLETE | Owner-only form uses the atomic product + base-unit RPC; no inventory is created. |
| M2.10C Selling Units / Barcode Management | COMPLETE | Owner-only add/edit of selling units and per-unit barcodes; the base unit cannot be renamed or have its conversion changed. |
| M2.10D Product Edit / Deactivate | COMPLETE | Owner-only master-data edit and non-destructive deactivate; inactive products remain available to admin/history reads but not normal cashier selling flow. |
| M2.10E Bulk Import | COMPLETE | Owner-only XLSX/CSV preview, server-backed master-data mapping, and per-row atomic import with partial-success reporting; import creates no inventory or batches. |
| M2.10F Hardening | COMPLETE | Product request normalization and import parser tests added; full application/database/static regression completed. |

Residual test debt: browser-level form-state preservation, navigation/redirect behavior, and route/service integration for product and selling-unit mutations still require a UI or dependency-injection harness. Current `tsx --test` coverage exercises pure request/parser logic, authorization policy, and safe API error mapping.

Manual M2.10B smoke check: login as owner_admin; open `/products`; confirm **Tambah Produk**; create a product with a leading-zero barcode; confirm redirect/detail, initial base unit, and stock `0`; confirm it appears in the list; then confirm kasir has no create action.

**Next: M2.11 — Inventory / Stock Receiving.**

## Backend capability with UI still planned

- Customer Return Backend: COMPLETE. Customer Return UI: COMPLETE. Supplier Return Backend: COMPLETE. Supplier Return UI: DEFERRED.
- Stock opname supports start, operational freeze, apply, and cancel; a complete count-entry/admin workflow is not complete.

## Production backlog

- Checkout idempotency key and safe recovery for uncertain submissions.
- Remote migration/deployment verification, backup/restore, and monitoring.
- Native thermal printer integration (browser print is current behavior).
- Return idempotency, Supplier Return UI, and Stock Opname Operational UI.
- Barcode workflow.
- Master-data management, reporting, and operational administration UI.
- Optional app-hosted static QRIS display UX; it is not a Pilot 1 blocker.
- Payment gateway, webhooks/polling, multi-outlet, offline sync, and granular RBAC are future scope.

## Current verification baseline

The latest verified local baseline includes the full configured application suites, 125/125 database tests passing, and the preserved concurrency baseline of 23 scenario groups / 230 runs / 529 invariant checks with 0 failures, 0 deadlocks, and 0 lock timeouts. Lint, typecheck, and build pass. These counts are a snapshot, not a release guarantee.
