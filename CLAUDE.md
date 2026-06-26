# CLAUDE.md — Pharmacy POS Project Context (Pilot 1)

Entry point for AI/coding agents working in this repo. Read this file first before touching any code. Detailed docs are in `docs/` — **don't read all of them at once**. Only reference the file relevant to the current task (see the "When to read which file" table below).

## Project Summary

A Point of Sale system for a pharmacy, Pilot 1. Focus: cashier, pharmaceutical product management (multi-unit, multi-batch, FEFO), and basic reporting. Intentionally simple and low-cost — read `docs/roadmap.md` section "Intentionally Out of Scope" before adding unrequested features (approval workflows, payment gateway, multi-branch, granular RBAC, PO/GR, payroll/CRM — all **out of scope**, do not implement unless explicitly asked).

## Tech Stack

- **Next.js (App Router)** — frontend + backend (API Routes) in a single codebase
- **Supabase** — Postgres, Auth, Storage
- **Vercel** — hosting, serverless functions

## Critical Rules (commonly violated — don't break these)

1. **Supabase client must be created inside the request handler**, not at the top-level module — see `docs/folder-structure.md` § 8.2. A top-level instance will leak across users in Vercel's serverless environment.
2. **Role is stored in Supabase Auth `app_metadata.role`** (`owner_admin` | `kasir`), not in a `roles`/`permissions` table. Do not create new RBAC tables.
3. **Checkout must use `FOR UPDATE` row locking** when fetching FEFO batches — see `docs/business-logic.md` § 7.1. Without this, two concurrent checkouts of the same product can oversell.
4. **`transaction_items` = one row per source batch**, not one row per product. If a single checkout item needs to draw from two batches, write two rows.
5. **Customer returns always go back to the ORIGINAL batch** (via `transaction_item_id`), never creating a new batch.
6. **Stock is decremented when checkout is created**, not when QRIS payment is confirmed — so stock isn't held hostage to a QRIS transaction that gets abandoned.
7. Supabase access from the client (browser) is denied via RLS; all production queries go through `service_role` in API Routes. Do not query Supabase directly from client components for transactional data.

## When to Read Which File

| Working on... | Read |
|---|---|
| Tables/columns, relations, RLS, role model | `docs/database-design.md` |
| Creating/modifying API endpoints | `docs/api-contract.md` |
| Checkout, void, returns, stock opname, reporting logic | `docs/business-logic.md` |
| File placement, env vars, Supabase client init | `docs/folder-structure.md` |
| Original requirements / why a feature exists or doesn't | `docs/prd.md` |
| Implementation order, intentionally undesigned features | `docs/roadmap.md` |

## Implementation Status

- SQL migrations are written and ready to run: `supabase/migrations/0001_init.sql` (schema) and `0002_rls_policies.sql` (RLS). Neither has been applied to any Supabase project yet.
- No application code exists yet (Next.js project not scaffolded). No `package.json`, `app/`, `lib/`, or `types/`.
- No seed data yet (`0003_seed.sql` is planned, not created).

Follow `docs/roadmap.md` (Stages 1–6) for implementation order. Stage 1 = run both migrations against a new Supabase project, then scaffold the Next.js project per `docs/folder-structure.md`.
