# Struktur Folder & Setup Proyek — POS Apotek (Pilot 1)

## 8. Struktur Folder Proyek (Next.js App Router)

```
pos-apotek/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (kasir)/                       # route group, middleware cek role
│   │   ├── layout.tsx
│   │   ├── kasir/
│   │   │   └── page.tsx               # UI POS utama (scan, cart, checkout)
│   │   ├── cash-drawer/
│   │   │   └── page.tsx
│   │   └── transactions/
│   │       ├── page.tsx               # riwayat transaksi (read)
│   │       └── [id]/page.tsx          # detail + cetak ulang struk
│   ├── (admin)/                       # route group, hanya owner_admin
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
│   │   │   ├── route.ts               # GET (riwayat, owner_admin)
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
│   └── ui/                            # Button, Input, Modal, Table (design system dasar)
├── lib/
│   ├── supabase/
│   │   ├── server.ts                  # createServerClient() -- WAJIB dipanggil per-request, bukan singleton modul (lihat 2.2.2 PRD)
│   │   ├── admin.ts                   # createAdminClient() service_role, dipanggil per-request juga
│   │   └── browser.ts                 # createBrowserClient() utk client component
│   ├── auth/
│   │   ├── getSession.ts
│   │   └── requireRole.ts             # helper guard di API Route: requireRole(req, ['owner_admin'])
│   ├── pos/
│   │   ├── fefo.ts                    # logic alokasi batch FEFO (reusable: checkout, preview stok)
│   │   ├── pricing.ts                 # hitung subtotal/pajak
│   │   └── invoiceNumber.ts           # generator INV-YYYYMMDD-XXXX
│   ├── validation/                    # zod schemas per endpoint (checkoutSchema, productSchema, dst)
│   └── utils/
│       ├── date.ts
│       └── currency.ts                # format Rupiah
├── types/
│   ├── database.types.ts              # generated via `supabase gen types typescript`
│   └── api.ts                         # tipe request/response per endpoint (selaras Bagian 6)
├── middleware.ts                      # cek session + role utk route group (admin)/(kasir)
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql              # isi Bagian 3
│   │   ├── 0002_rls_policies.sql      # isi Bagian 4
│   │   └── 0003_seed.sql              # data awal: kategori default, app_settings row
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
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # dipakai client utk auth & upload langsung ke Storage
SUPABASE_SERVICE_ROLE_KEY=         # HANYA dipakai di server (API Routes), JANGAN diekspos ke client
```

### 8.2 Aturan Krusial Inisialisasi Supabase Client (sesuai catatan PRD 2.2.2 & 8.2)

```ts
// lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

// JANGAN buat instance di top-level module (akan dipakai ulang antar request di Vercel serverless
// dan berisiko campur data sesi). Selalu panggil function ini DI DALAM setiap handler.
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
  const session = await requireRole(req, ["owner_admin"]); // 401/403 di dalam helper ini
  const supabase = createAdminClient(); // <-- dibuat baru, di dalam handler
  // ... business logic
}
```

---

