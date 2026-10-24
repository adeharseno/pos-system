# Folder Structure & Project Setup — Pharmacy POS (Pilot 1)

Pilot 1 is a modular monolith. The current source uses `src/app` for UI and
Route Handlers, `src/modules` for domains, `src/lib/supabase` for server/browser
clients, `src/types` for generated database types, and `supabase/` for
migrations and database tests.

## Current implemented areas

```text
src/
├── app/
│   ├── (protected)/cashier, cash-drawer, transactions/[id]/receipt
│   └── api/ cash-drawer, inventory, products, returns, stock-opname, transactions
├── modules/
│   ├── auth/           # employee session and position guards
│   ├── catalog/        # cashier name/SKU search and inventory reads
│   ├── cash-drawer/    # session RPCs
│   ├── inventory/      # stock-opname RPCs
│   ├── returns/        # return RPCs
│   ├── sales/          # cart, checkout, QRIS, receipt, sales RPCs/reads
│   └── shared/         # API boundary, validation, RPC/data helpers
├── lib/supabase/       # browser, session-server, and service-role factories
└── types/database.types.ts

supabase/
├── migrations/         # 0001 through 0005
└── tests/database/     # pgTAP constraints and core-function tests
```

Planned product/admin, reporting, barcode, transaction-history, and full
returns/opname UI modules should be added only when their milestone starts;
their old proposed paths are not current implementation claims.

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
