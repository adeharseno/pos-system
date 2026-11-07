# Folder Structure & Project Setup — Pharmacy POS (Pilot 1)

Pilot 1 is a modular monolith. The current source uses `src/app` for UI and
Route Handlers, `src/modules` for domains, `src/lib/supabase` for server/browser
clients, `src/types` for generated database types, and `supabase/` for
migrations and database tests.

## Current implemented areas

```text
src/
├── app/
│   ├── (protected)/cashier, transactions/[id]/receipt, transactions/[id]/return
│   └── api/ auth, employees, expenses, inventory, products, purchasing, returns, stock-opname, transactions
├── modules/
│   ├── auth/           # sessions, accounts, roles, permissions, invitations
│   ├── catalog/        # product master, lookup, units, import, master data
│   ├── dashboard/      # dashboard policy, analytics and presentation
│   ├── expenses/       # operational expense reads/writes
│   ├── inventory/      # overview, receiving and stock-opname
│   ├── purchasing/     # purchase invoices, items, receiving and payments
│   ├── reports/        # sales, product, payment/refund and P&L
│   ├── returns/        # return RPCs
│   ├── sales/          # cart, checkout, QRIS, receipt, transaction log, sales RPCs/reads
│   └── shared/         # API boundary, validation, RPC/data helpers
├── lib/supabase/       # browser, session-server, and service-role factories
└── types/database.types.ts

supabase/
├── migrations/         # 0001 through 0033
├── tests/database/     # pgTAP constraints, functions and reporting tests
└── tests/concurrency/  # critical concurrency scenarios
```

The tree above is a summary, not an exhaustive manifest. Use `rg --files src/app
src/modules supabase` before planning a new module or route.

## Dependency direction

```text
UI / Route Handler -> application service -> data adapter -> Supabase/RPC
```

Route Handlers remain HTTP adapters. They authenticate, validate external
input, inject the server-derived employee identity, and invoke services.
Browser components may use Auth/session features but must not call protected
RPCs or mutate operational tables. Server-only reads use the data adapters;
critical stock/financial mutations remain in PostgreSQL.

## Environment and local commands

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never expose the service-role key. Use `npm run db:types` after a local schema
change; generated types are not hand-edited. For local verification use
`npm run supabase:start`, `npm run db:reset`, `npm run db:lint`, and
`npm run db:test`.
