# Folder Structure & Project Setup — Pharmacy POS (Pilot 1)

> Architecture style: **modular monolith**. One Next.js application and deployment, with domain boundaries kept explicit in code.

## 1. Proposed Structure

```text
pos-apotek/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (kasir)/
│   │   ├── kasir/page.tsx
│   │   ├── cash-drawer/page.tsx
│   │   └── transactions/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   ├── (admin)/
│   │   ├── dashboard/page.tsx
│   │   ├── products/[...]/
│   │   ├── categories/page.tsx
│   │   ├── suppliers/page.tsx
│   │   ├── storage-locations/page.tsx
│   │   ├── stock/[...]/
│   │   ├── returns/page.tsx
│   │   ├── reports/[...]/
│   │   ├── employees/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── products/[...]/route.ts
│   │   ├── categories/[...]/route.ts
│   │   ├── suppliers/[...]/route.ts
│   │   ├── storage-locations/[...]/route.ts
│   │   ├── stock/[...]/route.ts
│   │   ├── cash-drawer/[...]/route.ts
│   │   ├── transactions/[...]/route.ts
│   │   ├── returns/[...]/route.ts
│   │   ├── stock-opname/[...]/route.ts
│   │   ├── reports/[...]/route.ts
│   │   ├── expenses/route.ts
│   │   ├── employees/[...]/route.ts
│   │   ├── shifts/route.ts
│   │   ├── attendances/[...]/route.ts
│   │   ├── storage/[...]/route.ts
│   │   └── settings/route.ts
│   ├── layout.tsx
│   └── globals.css
│
├── modules/
│   ├── auth/
│   │   ├── service.ts
│   │   ├── guards.ts
│   │   └── types.ts
│   ├── catalog/
│   │   ├── service.ts
│   │   ├── repository.ts
│   │   ├── schemas.ts
│   │   └── types.ts
│   ├── inventory/
│   │   ├── service.ts
│   │   ├── repository.ts
│   │   ├── schemas.ts
│   │   └── types.ts
│   ├── sales/
│   │   ├── service.ts              # calls checkout/confirm/void RPCs
│   │   ├── repository.ts           # read-only/list/detail queries
│   │   ├── schemas.ts
│   │   └── types.ts
│   ├── returns/
│   ├── cash-drawer/
│   ├── reporting/
│   └── employees/
│
├── components/
│   ├── pos/
│   ├── products/
│   ├── inventory/
│   ├── reports/
│   └── ui/
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts
│   │   ├── admin.ts
│   │   └── browser.ts
│   ├── validation/
│   └── utils/
│       ├── date.ts                 # Asia/Jakarta helpers
│       └── currency.ts
│
├── types/
│   ├── database.types.ts
│   └── api.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   ├── 0002_rls_policies.sql
│   │   ├── 0003_core_functions.sql # checkout/confirm/void/returns/opname
│   │   └── 0004_seed.sql
│   └── config.toml
│
├── middleware.ts
├── public/
├── .env.local.example
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 2. Dependency Direction

```text
app/api Route Handler
      |
      v
module service
      |
      +--> module repository (normal queries)
      |
      `--> Supabase RPC (critical atomic mutation)

module -> lib is allowed
lib -> module is not allowed
one module should not reach into another module's repository directly
```

For cross-domain use cases, call the other module's public service or keep the orchestration in a dedicated domain service.

---

## 3. Route Handler Rule

Route Handlers are HTTP adapters, not the business-logic layer.

Preferred pattern:

```ts
export async function POST(req: Request) {
  const actor = await requireRole(req, ["kasir", "owner_admin"]);
  const input = checkoutSchema.parse(await req.json());
  const result = await salesService.checkout({ actor, input });
  return Response.json({ data: result, error: null });
}
```

Do not put FEFO loops, multi-table stock updates, invoice sequencing, or return allocation directly in Route Handlers.

---

## 4. Supabase Clients

### Browser client

Use only for:

- Supabase Auth/session operations
- approved signed/direct Storage uploads

Do not use it for transactional operational-table queries.

### Server user/session client

Create per request when the current Supabase session is required.

### Admin/service-role client

Server-only. Never expose the key to browser code.

A service-role client can be created by a helper; do not attach mutable user session state to a shared singleton. Route authorization must always derive from the incoming authenticated request before privileged DB access is performed.

---

## 5. Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never prefix the service-role key with `NEXT_PUBLIC_`.

---

## 6. Database Function Boundary

Create `supabase/migrations/0003_core_functions.sql` during implementation hardening.

Expected RPCs:

- `checkout_transaction(...)`
- `confirm_qris_payment(...)`
- `void_transaction(...)`
- `create_customer_return(...)`
- `create_supplier_return(...)`
- `apply_stock_opname(...)`

Exact signatures may evolve while implementing, but their transactional responsibility must not move back into multiple independent HTTP database calls.

---

## 7. Deployment

Pilot target:

```text
Git repository
  -> Vercel Next.js deployment
  -> *.vercel.app

Supabase project
  -> PostgreSQL
  -> Auth
  -> Storage
```

No custom domain or VPS is required for development/demo Pilot 1. Re-check current hosting plan terms before commercial production use.
