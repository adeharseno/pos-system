# Folder Structure & Project Setup — Pharmacy POS (Pilot 1)

## 8. Project Folder Structure (Next.js App Router)

```
pos-apotek/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (kasir)/                       # route group, middleware checks role
│   │   ├── layout.tsx
│   │   ├── kasir/
│   │   │   └── page.tsx               # main POS UI (scan, cart, checkout)
│   │   ├── cash-drawer/
│   │   │   └── page.tsx
│   │   └── transactions/
│   │       ├── page.tsx               # transaction history (read)
│   │       └── [id]/page.tsx          # detail + reprint receipt
│   ├── (admin)/                       # route group, owner_admin only
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── products/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/edit/page.tsx
│   │   ├── categories/page.tsx
│   │   ├── suppliers/page.tsx
│   │   ├── storage-locations/page.tsx
│   │   ├── stock/
│   │   │   ├── batches/page.tsx
│   │   │   ├── opname/page.tsx
│   │   │   └── opname/[id]/page.tsx
│   │   ├── returns/page.tsx
│   │   ├── reports/
│   │   │   ├── sales/page.tsx
│   │   │   ├── profit-loss/page.tsx
│   │   │   └── stock-value/page.tsx
│   │   ├── employees/page.tsx
│   │   └── settings/page.tsx          # upload QRIS image, expiry_alert_days
│   ├── api/
│   │   ├── products/
│   │   │   ├── route.ts               # GET, POST
│   │   │   ├── lookup/route.ts        # GET ?barcode=
│   │   │   └── [id]/
│   │   │       ├── route.ts           # GET, PUT, DELETE
│   │   │       ├── batches/route.ts   # GET, POST
│   │   │       └── stock-card/route.ts
│   │   ├── categories/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       └── subcategories/route.ts
│   │   ├── subcategories/[id]/route.ts
│   │   ├── suppliers/[..]/route.ts
│   │   ├── storage-locations/[..]/route.ts
│   │   ├── stock/
│   │   │   ├── expiring/route.ts
│   │   │   └── low/route.ts
│   │   ├── cash-drawer/
│   │   │   ├── open/route.ts
│   │   │   ├── current/route.ts
│   │   │   ├── route.ts               # GET (history, owner_admin)
│   │   │   └── [id]/close/route.ts
│   │   ├── transactions/
│   │   │   ├── checkout/route.ts
│   │   │   ├── route.ts               # GET list
│   │   │   └── [id]/
│   │   │       ├── route.ts           # GET detail
│   │   │       ├── confirm-payment/route.ts
│   │   │       ├── void/route.ts
│   │   │       └── receipt/route.ts
│   │   ├── returns/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── stock-opname/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       ├── items/[itemId]/route.ts
│   │   │       └── apply/route.ts
│   │   ├── reports/
│   │   │   ├── sales/route.ts
│   │   │   ├── profit-loss/route.ts
│   │   │   └── stock-value/route.ts
│   │   ├── expenses/route.ts
│   │   ├── dashboard/summary/route.ts
│   │   ├── employees/[..]/route.ts
│   │   ├── shifts/route.ts
│   │   ├── attendances/check-in/route.ts
│   │   ├── attendances/check-out/route.ts
│   │   ├── storage/
│   │   │   ├── prescription-upload-url/route.ts
│   │   │   └── qris-upload-url/route.ts
│   │   └── settings/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── pos/                           # CartItem, BarcodeScanner, UnitSelector, QrisModal, PaymentPanel
│   ├── products/                      # ProductForm, UnitFieldArray, BatchTable
│   ├── reports/                       # SalesChart, ProfitLossTable
│   └── ui/                            # Button, Input, Modal, Table (base design system)
├── lib/
│   ├── supabase/
│   │   ├── server.ts                  # createServerClient() -- must be called per-request, not a module singleton (see PRD 2.2.2)
│   │   ├── admin.ts                   # createAdminClient() service_role, also called per-request
│   │   └── browser.ts                 # createBrowserClient() for client components
│   ├── auth/
│   │   ├── getSession.ts
│   │   └── requireRole.ts             # guard helper in API Routes: requireRole(req, ['owner_admin'])
│   ├── pos/
│   │   ├── fefo.ts                    # FEFO batch allocation logic (reusable: checkout, stock preview)
│   │   ├── pricing.ts                 # subtotal/tax calculation
│   │   └── invoiceNumber.ts           # INV-YYYYMMDD-XXXX generator
│   ├── validation/                    # zod schemas per endpoint (checkoutSchema, productSchema, etc.)
│   └── utils/
│       ├── date.ts
│       └── currency.ts                # Rupiah formatting
├── types/
│   ├── database.types.ts              # generated via `supabase gen types typescript`
│   └── api.ts                         # request/response types per endpoint (aligned with Section 6)
├── middleware.ts                      # session check + role guard for (admin)/(kasir) route groups
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql              # Section 3 contents
│   │   ├── 0002_rls_policies.sql      # Section 4 contents
│   │   └── 0003_seed.sql              # initial data: default categories, app_settings row
│   └── config.toml
├── public/
├── .env.local.example
├── next.config.js
├── package.json
└── tsconfig.json
```

### 8.1 Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # used by client for auth & direct Storage uploads
SUPABASE_SERVICE_ROLE_KEY=         # server only (API Routes) — never expose to the client
```

### 8.2 Supabase Client Initialization Rules (per PRD 2.2.2 & 8.2)

```ts
// lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

// Do NOT create an instance at the top-level module scope — it will be reused across
// requests in Vercel's serverless environment and risks mixing session data between users.
// Always call this function INSIDE each handler.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```
```ts
// app/api/products/route.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: Request) {
  const session = await requireRole(req, ["owner_admin"]); // returns 401/403 inside the helper
  const supabase = createAdminClient(); // <-- fresh instance, inside the handler
  // ... business logic
}
```

---
