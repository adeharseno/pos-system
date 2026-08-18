# Architecture — Pharmacy POS (Pilot 1)

> Source of truth for system architecture and deployment decisions. See also `database-design.md`, `api-contract.md`, `business-logic.md`, and `folder-structure.md`.

## 1. Architecture Style

Pilot 1 uses a **modular monolith**, not microservices.

There is one Next.js application, one deployment, and one PostgreSQL database. Code is separated by business domain so that boundaries remain clear even though the system is deployed as a single application.

```text
Browser
  |
  v
Next.js modular monolith (Vercel)
  |- UI / App Router
  |- Route Handlers (HTTP boundary)
  |- Domain modules
  |   |- catalog
  |   |- inventory
  |   |- sales
  |   |- payments
  |   |- returns
  |   |- cash-drawer
  |   |- reporting
  |   `- employees
  |
  v
Supabase
  |- PostgreSQL
  |- Auth
  `- Storage
```

### Why not microservices in Pilot 1?

- Single outlet / small number of cashiers.
- One transactional database is desirable for stock and financial consistency.
- Checkout, FEFO allocation, returns, voids, and stock adjustments need strong atomicity.
- Microservices would add network calls, distributed transactions, service-to-service auth, extra deployments, observability, and infrastructure cost without solving a Pilot 1 requirement.

Module boundaries should still be respected so a domain can be extracted later if scale actually requires it.

---

## 2. Responsibility Split

### Next.js / Vercel

Responsible for:

- UI and navigation.
- Authentication/session boundary.
- Authorization checks (`owner_admin` / `kasir`).
- Request validation through the shared typed boundary validators.
- Normal CRUD orchestration.
- Calling database RPCs for critical transactional workflows.
- Formatting API responses.

Route Handlers must stay thin. They should not contain large FEFO/stock mutation algorithms.

Application code follows one-way dependency flow:

```text
presentation / future Route Handler
  -> domain application service
  -> domain data adapter
  -> server-only Supabase client
  -> PostgreSQL RPC
```

Critical mutations are exposed by the `sales`, `returns`, and `inventory`
application services. Callers must not bypass these services with browser-side
table writes or reimplement FEFO, invoice, returnability, restoration, or
stock-opname algorithms in TypeScript.

Route Handlers use a shared response/error boundary and remain HTTP adapters:
they authenticate, parse external input, inject the server-derived employee ID,
and call application services. Critical adapters and the service-role Supabase
client remain `server-only`; browser roles retain no RPC/table mutation access.

Lifecycle-protected operations such as QRIS confirmation, void, return limits,
and opname transitions safely reject repeated/conflicting calls in PostgreSQL.
Checkout is atomic but is not idempotent when a successful response is lost to
the network; automated checkout retry needs an explicit idempotency key in a
future milestone.

Cash-drawer open/close are also PostgreSQL RPCs. Checkout, cash refund, and
drawer close serialize on the same drawer row, preventing a transaction from
being committed to a closed drawer while being omitted from its closing cash
snapshot.

### Supabase PostgreSQL

Responsible for:

- Persistent relational data.
- Constraints and referential integrity.
- Transactional locking.
- Atomic stock-changing workflows through PostgreSQL functions/RPC.
- Invoice sequence generation.
- Reporting aggregations when doing them in SQL is more efficient.

Critical workflows that must execute as **one database transaction**:

1. Checkout + FEFO allocation + stock deduction + invoice generation.
2. QRIS payment status transition.
3. Void + stock restoration.
4. Customer/supplier return + stock movement + refund snapshots.
5. Stock opname start/freeze, apply, and cancel.

Multiple independent `supabase.from(...).insert/update/select()` calls from a Route Handler must **not** be treated as one transaction.

### Supabase Auth

Responsible for login and session management. Application roles remain in Auth `app_metadata.role`:

- `owner_admin`
- `kasir`

An authenticated user receives business access only after the server resolves
the stable `auth.users -> user_profiles -> employees` UUID relationship and
confirms that the employee is active. Role and employee identity are never
accepted from browser input. Next.js Proxy refreshes cookies; authoritative
authorization remains in server layouts, actions, and application services.

### Supabase Storage

Used for:

- prescription images
- product images
- static QRIS image

---

## 3. Deployment Strategy

### Pilot / development target

```text
Next.js application     -> Vercel
PostgreSQL/Auth/Storage -> Supabase
Application URL         -> *.vercel.app
Custom domain           -> not required for Pilot 1
```

The project is intentionally designed to start without a purchased VPS or custom domain.

### Cost constraint

The architecture should remain compatible with the available free tiers during development, portfolio/demo use, and low-volume pilot validation.

**Important:** hosting-plan terms and quotas can change. Before using the system for live commercial pharmacy operations, re-check the current Vercel/Supabase plan limits and commercial-use terms. The technical architecture does not require a rewrite if a paid plan or another compatible host is later needed.

---

## 4. Data & Time Conventions

- PostgreSQL timestamps use `timestamptz` and are stored in UTC.
- Pilot 1 business timezone is **Asia/Jakarta**.
- Business-day grouping, invoice date, daily reports, and expiry comparisons must use Asia/Jakarta semantics rather than the Vercel server timezone.
- Monetary values use PostgreSQL `numeric`, never JavaScript floating-point arithmetic as the source of truth for persisted totals.
- Stock quantity is stored in the product's base unit as integer values.

---

## 5. Security Boundary

```text
Browser
  | authenticated request
  v
Next.js Route Handler
  |- verify Supabase session
  |- verify application role
  |- validate body/query
  v
Supabase service-role client / RPC
  v
PostgreSQL
```

Rules:

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Transactional tables are not directly queried from client components.
- RLS denies direct `anon` / `authenticated` access to operational tables as defense-in-depth.
- Storage uses explicit bucket policies because signed/direct uploads may originate from the browser.
- Every stock/financial mutation records the responsible employee and timestamp.

---

## 6. Scaling Path (not Pilot 1 work)

Stay modular-monolith until there is evidence that a module needs independent scaling or deployment.

Possible later extractions include reporting or external payment/event processing. Extraction should be driven by measurable needs, not by an upfront microservice requirement.


## Stock Opname Concurrency Boundary

Pilot 1 uses a batch-level operational freeze during stock opname. Stock-changing RPCs lock their target `product_batches` rows and then re-check active opname membership before mutation. This preserves the single-database atomicity advantage of the modular monolith and prevents a physical count from overwriting sales/returns that occurred after snapshot.
