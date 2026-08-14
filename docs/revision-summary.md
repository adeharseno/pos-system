# Revision Summary — M0 Architecture & Schema Hardening (Round 2)

Date: 14 August 2026

This revision was completed before application implementation or database deployment.

## Main Changes

1. Architecture explicitly defined as **modular monolith**.
2. Deployment target clarified: Next.js on Vercel, Supabase for PostgreSQL/Auth/Storage, no custom domain/VPS required for development/demo.
3. Critical stock-changing workflows moved conceptually to atomic PostgreSQL RPC/functions.
4. Fixed `pg_trgm` migration ordering before trigram index creation.
5. Replaced one-row-per-batch `transaction_items` design with:
   - `transaction_items` = customer-facing sale line
   - `transaction_item_batches` = FEFO allocation
6. Added QRIS lifecycle `pending_payment -> completed`.
7. Added DB-side invoice sequence table for concurrency-safe invoice numbers.
8. Hardened cash-drawer ownership validation.
9. Redesigned returns with:
   - cumulative partial-return validation
   - original batch restoration
   - refund snapshots
   - refund method
   - COGS reversal snapshots
   - return batch allocation table
10. Defined void/return conflict rule: transactions with customer returns cannot be voided in Pilot 1.
11. Changed stock opname to batch-level counting with nullable `physical_quantity` until counted.
12. Added Asia/Jakarta business-date convention while retaining UTC timestamps.
13. Added category/subcategory DB integrity, tax/min-stock checks, and `updated_at` triggers.
14. Reworked implementation roadmap to include architecture/database hardening and concurrency tests before cashier UI work.
15. Corrected checkout pseudocode so the `transactions` header is inserted before FK-dependent `transaction_items`.
16. Added `returns.cash_drawer_session_id` for customer cash refunds; drawer reconciliation now uses the drawer that physically paid the refund.
17. Added composite foreign keys for product/unit/batch consistency across transaction, return, and stock-opname rows.
18. Added database payment/confirmation/void lifecycle check constraints.
19. Added stock-opname operational freeze, a single in-progress Pilot 1 session, cancel lifecycle, and race-safe batch lock/re-check rules.

## Current Implementation Status

- Documentation: revised.
- `0001_init.sql`: revised again to match round-2 integrity/lifecycle rules.
- `0002_rls_policies.sql`: revised for new tables.
- `0003_core_functions.sql`: not yet implemented.
- Supabase migrations: not yet applied.
- Next.js application: not yet scaffolded.
