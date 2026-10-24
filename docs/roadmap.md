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

## Next milestone

**M2.10 — Stock Opname Operational UI** is next.

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

The latest verified local baseline is 112/112 application tests passing, 117/117 database tests passing, and concurrency verification across 21 scenario groups / 210 runs with 486 invariant checks, 0 failures, 0 deadlocks, and 0 lock timeouts. Lint, typecheck, and build pass. These counts are a snapshot, not a release guarantee.
