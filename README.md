# Pharmacy POS — Pilot 1

Low-cost pharmacy Point of Sale pilot using a **Next.js modular monolith + Supabase PostgreSQL/Auth/Storage + Vercel**.

## Current Status

The local implementation is complete through M2.7.1: atomic checkout/payment/
void/return/opname RPCs, employee-position authorization, cashier checkout,
manual QRIS confirmation, and authoritative browser-print receipts. Local
migrations `0001`–`0005` and their tests are verified. Remote migration and
deployment verification remain separate backlog work.

## Local Development

1. Copy `.env.example` to `.env.local` and provide Supabase credentials.
2. Install dependencies with `npm install`.
3. Start the application with `npm run dev`.

### Karyawan dan aktivasi akun (M2.16D)

Owner Admin dapat membuka `/employees` melalui menu **Karyawan** untuk mengelola
data, undangan akun, dan pengaturan akses. Atur `APP_SITE_URL` sesuai alamat lokal
yang dipakai untuk aktivasi; `APP_ADDITIONAL_ORIGINS` dapat memuat alias lokal yang
dipercaya. Undangan mengarah ke formulir pengaturan kata sandi, tanpa membawa token
ke URL halaman formulir.

Pengaturan izin individu tersimpan melalui backend yang ada. Sebagian akses POS
masih mengikuti peran sampai integrasi izin pada endpoint tersebut dilakukan.
Lihat [dokumentasi UI karyawan](docs/employee-ui.md) untuk perilaku dan pengujiannya.

Quality checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Local Supabase

Docker Desktop must be running. The local database is reproducible from the
checked-in migrations:

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:test
```

Remote project linking is intentionally local developer state. Create a
Supabase project, authenticate the CLI, then run
`npx supabase link --project-ref <project-ref>` without committing credentials
or the generated temporary state.

## Documentation

- [`docs/prd.md`](docs/prd.md) — product requirements and scope
- [`docs/architecture.md`](docs/architecture.md) — modular-monolith architecture and deployment
- [`docs/database-design.md`](docs/database-design.md) — database model and integrity rules
- [`docs/business-logic.md`](docs/business-logic.md) — checkout, FEFO, QRIS, void, returns, stock opname, reports
- [`docs/authentication.md`](docs/authentication.md) — Supabase Auth, employee mapping, authorization, and provisioning
- [`docs/api-contract.md`](docs/api-contract.md) — HTTP API contract
- [`docs/folder-structure.md`](docs/folder-structure.md) — current and planned Next.js/domain module structure
- [`docs/roadmap.md`](docs/roadmap.md) — implementation order and test gates
- [`docs/revision-summary.md`](docs/revision-summary.md) — M0 hardening changes
- [`docs/database-setup.md`](docs/database-setup.md) — local/remote migration workflow

## Infrastructure Target

```text
Next.js -> Vercel
          |
          v
       Supabase
       |- PostgreSQL
       |- Auth
       `- Storage
```

A custom domain or VPS is not required for development/demo Pilot 1. Hosting plan limits and commercial-use terms must be verified before live production use.

## Important

Critical inventory/financial workflows are designed to run atomically in PostgreSQL RPC/functions. Do not implement checkout/void/returns/opname as unrelated database calls from the Next.js API layer. Stock opname freezes affected batches while in progress; cash refunds belong to the drawer that pays the refund; composite FKs and lifecycle checks are part of the base schema.

QRIS lifecycle is deliberately strict: an unconfirmed `pending_payment` transaction may be confirmed or voided, while a confirmed `completed` QRIS transaction can only be reversed through customer return/refund.

Pilot 1 QRIS is manually confirmed against the pharmacy's external/physical
counter QRIS. It has no dynamic QRIS, gateway, webhook/polling, or required
app-hosted QRIS image.
