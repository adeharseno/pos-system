# API Contract — POS Apotek (Pilot 1)

> Bagian dari Technical Design. Skema tabel terkait ada di `database-design.md`. Logic detail di `business-logic.md`.

## 6. API Contract (Next.js API Routes)

Base path: `/api`. Semua response sukses: `{ data: ..., error: null }`. Semua error: `{ data: null, error: { code, message } }`, HTTP status sesuai (400/401/403/404/409/422/500).
Header wajib: `Authorization: Bearer <supabase_access_token>` (dibaca dari cookie session Supabase, tidak perlu manual di sisi client untuk same-origin request).

### 6.1 Produk & Master Data

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/api/products` | both | List produk. Query: `q` (cari nama/SKU), `category_id`, `subcategory_id`, `drug_classification`, `storage_location_id`, `stock_status` (`low`/`out`/`all`), `page`, `limit` |
| GET | `/api/products/:id` | both | Detail produk + `product_units[]` + `product_batches[]` (yang `quantity > 0`, urut `expired_date` ASC) |
| GET | `/api/products/lookup?barcode=` | both | Cari produk by barcode di `product_units.barcode`. Dipakai saat scan di kasir. |
| POST | `/api/products` | owner_admin | Buat produk + `units[]` (minimal 1, salah satu `is_base_unit=true`) |
| PUT | `/api/products/:id` | owner_admin | Update produk + units (upsert) |
| DELETE | `/api/products/:id` | owner_admin | Soft: set `is_active=false` (tidak hard delete, karena ada histori transaksi) |
| GET | `/api/categories` | both | List kategori + nested subcategories |
| POST | `/api/categories` | owner_admin | Buat kategori |
| PUT/DELETE | `/api/categories/:id` | owner_admin | Update/nonaktifkan kategori |
| POST | `/api/categories/:id/subcategories` | owner_admin | Buat subkategori |
| PUT/DELETE | `/api/subcategories/:id` | owner_admin | Update/nonaktifkan subkategori |
| GET/POST | `/api/suppliers` | owner_admin (GET both) | List/buat supplier |
| PUT/DELETE | `/api/suppliers/:id` | owner_admin | Update/nonaktifkan |
| GET/POST | `/api/storage-locations` | owner_admin (GET both) | List/buat lokasi rak |

**Contoh — `POST /api/products`**
```jsonc
// Request
{
  "sku": "PCT-500-001",
  "name": "Paracetamol 500mg",
  "generic_name": "Paracetamol",
  "category_id": "uuid",
  "subcategory_id": "uuid",
  "drug_classification": "otc",
  "base_unit": "tablet",
  "tax_rate": 11,
  "is_taxable": true,
  "storage_location_id": "uuid",
  "minimum_stock": 100,
  "default_supplier_id": "uuid",
  "units": [
    { "unit_name": "Tablet", "conversion_to_base": 1, "selling_price": 500, "barcode": "899000111", "is_base_unit": true },
    { "unit_name": "Strip", "conversion_to_base": 10, "selling_price": 4500, "barcode": "899000112", "is_base_unit": false },
    { "unit_name": "Kotak", "conversion_to_base": 100, "selling_price": 40000, "barcode": "899000113", "is_base_unit": false }
  ]
}
// Response 201
{ "data": { "id": "uuid", "sku": "PCT-500-001", "...": "..." }, "error": null }
```
Validasi server: tepat satu `units[].is_base_unit = true` dan `conversion_to_base = 1` untuknya → `422` jika tidak terpenuhi.

### 6.2 Batch & Stok

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/api/products/:id/batches` | both | List batch produk (termasuk yang sudah expired, untuk histori) |
| POST | `/api/products/:id/batches` | owner_admin | Input stok manual (5.7.1). Jika `batch_number`+`expired_date` sama dengan entri existing → tambahkan ke `quantity` entri tersebut, bukan baris baru |
| GET | `/api/products/:id/stock-card` | owner_admin | Kartu stok (5.7.2): gabungan transaction_items, return_items, stock_opname_items terkait produk/batch, urut waktu |
| GET | `/api/stock/expiring` | both | List batch mendekati expired dalam N hari (default dari `app_settings.expiry_alert_days`) |
| GET | `/api/stock/low` | both | List produk dengan total stok aktif < `minimum_stock` |

**Contoh — `POST /api/products/:id/batches`**
```jsonc
// Request
{ "batch_number": "B240601", "expired_date": "2027-06-01", "quantity": 500, "cost_price": 350, "received_date": "2026-06-20" }
// Response 201
{ "data": { "id": "uuid", "product_id": "uuid", "quantity": 500, "...": "..." }, "error": null }
```

### 6.3 Kasir / Transaksi (inti)

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/api/cash-drawer/open` | kasir | Buka sesi kas shift |
| GET | `/api/cash-drawer/current` | kasir | Sesi kas aktif milik kasir login |
| POST | `/api/cash-drawer/:id/close` | kasir | Tutup sesi, hitung selisih |
| GET | `/api/cash-drawer` | owner_admin | Riwayat seluruh sesi kas |
| POST | `/api/transactions/checkout` | kasir | **Endpoint inti**: proses transaksi penjualan (lihat 7.1 algoritma) |
| POST | `/api/transactions/:id/confirm-payment` | kasir | Konfirmasi pembayaran QRIS manual |
| GET | `/api/transactions` | both | List transaksi. Query: `from`, `to`, `cashier_id`, `payment_method`, `status` |
| GET | `/api/transactions/:id` | both | Detail transaksi + items + prescription |
| GET | `/api/transactions/:id/receipt` | both | Data terformat untuk cetak struk (ESC/POS payload, lihat 7.3) |
| POST | `/api/transactions/:id/void` | kasir/owner_admin | Void transaksi (7.2) |

**Contoh — `POST /api/transactions/checkout`**
```jsonc
// Request
{
  "cash_drawer_session_id": "uuid",
  "items": [
    { "product_id": "uuid", "product_unit_id": "uuid", "quantity": 2 },
    { "product_id": "uuid-2", "product_unit_id": "uuid-2", "quantity": 1 }
  ],
  "prescription": {                       // wajib ada jika salah satu item requires_prescription
    "prescription_number": "RX-001",
    "doctor_name": "dr. Andi",
    "patient_name": "Budi",
    "photo_url": "https://.../prescriptions/xxx.jpg"  // sudah diupload duluan ke Storage dari client
  },
  "payment_method": "cash",                // "cash" | "qris"
  "cash_received": 50000                   // wajib jika payment_method = cash
}
// Response 201
{
  "data": {
    "transaction_id": "uuid",
    "invoice_number": "INV-20260626-0007",
    "subtotal": 45000,
    "tax_amount": 4950,
    "total_amount": 49950,
    "cash_change": 50,
    "status": "completed",        // jika qris tanpa confirm dulu -> status "pending_payment" (lihat catatan)
    "items": [ /* breakdown per batch FEFO, lihat 7.1 */ ]
  },
  "error": null
}
```
Error khusus: `409 INSUFFICIENT_STOCK`, `422 PRESCRIPTION_REQUIRED`, `422 EXPIRED_BATCH_ONLY`.

> **Catatan status QRIS**: untuk transaksi `payment_method=qris`, `checkout` membuat transaksi dengan status sementara (disarankan kolom tambahan ringan `status` tetap `completed` tapi **stok baru dikurangi setelah** `confirm-payment` dipanggil — lihat algoritma 7.1.2). Ini menjaga agar stok tidak "terkunci" untuk transaksi QRIS yang batal di tengah jalan.

**Contoh — `POST /api/transactions/:id/void`**
```jsonc
// Request
{ "reason": "Salah input produk" }
// Response 200
{ "data": { "transaction_id": "uuid", "status": "voided", "voided_at": "...", "stock_restored": true }, "error": null }
```

### 6.4 Resep & Storage

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/api/storage/prescription-upload-url` | kasir | Generate signed upload URL Supabase Storage (bucket `prescriptions`) agar foto diupload langsung dari client tanpa lewat server Next.js (hemat eksekusi serverless) |
| POST | `/api/storage/qris-upload-url` | owner_admin | Signed URL untuk upload gambar QRIS statis |

### 6.5 Retur

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/api/returns` | owner_admin/kasir | Buat retur (pelanggan atau supplier), lihat 7.4 |
| GET | `/api/returns` | both | List retur, filter `source`, `from`, `to` |
| GET | `/api/returns/:id` | both | Detail retur |

**Contoh — `POST /api/returns` (retur pelanggan)**
```jsonc
{
  "source": "customer",
  "transaction_id": "uuid",
  "reason": "Produk rusak",
  "items": [
    { "transaction_item_id": "uuid", "quantity_in_base": 10 }
  ]
}
```
**Contoh — retur ke supplier**
```jsonc
{
  "source": "supplier",
  "reason": "expired",
  "items": [ { "product_id": "uuid", "batch_id": "uuid", "quantity_in_base": 50 } ]
}
```

### 6.6 Stock Opname

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| POST | `/api/stock-opname` | owner_admin | Buat sesi baru. Body: `storage_location_id?` → server generate `stock_opname_items` snapshot otomatis untuk seluruh produk pada lokasi tersebut (atau semua produk jika kosong) |
| GET | `/api/stock-opname/:id` | owner_admin | Detail sesi + items |
| PUT | `/api/stock-opname/:id/items/:itemId` | owner_admin | Input `physical_quantity` per item |
| POST | `/api/stock-opname/:id/apply` | owner_admin | Terapkan seluruh selisih ke `product_batches.quantity`, set `status='applied'` |

### 6.7 Laporan & Keuangan

| Method | Endpoint | Role | Deskripsi |
|---|---|---|---|
| GET | `/api/reports/sales` | owner_admin | Query: `period` (`daily`/`weekly`/`monthly`/`yearly`) atau `from`/`to`, `cashier_id?`, `payment_method?`, `group_by` (`product`/`category`/`none`) |
| GET | `/api/reports/profit-loss` | owner_admin | Query: `from`,`to` → `{ total_sales, total_hpp, total_expenses, net_profit }` |
| GET | `/api/reports/stock-value` | owner_admin | Nilai stok saat ini (`sum(quantity * cost_price)` per batch aktif) |
| GET/POST | `/api/expenses` | owner_admin | List/input biaya operasional manual |
| GET | `/api/dashboard/summary` | both | Total transaksi & omset (today/month/year/all-time) + stok kritis + mendekati expired (5.2) |

### 6.8 Karyawan & Operasional

| Method | Endpoint | Role |
|---|---|---|
| GET/POST `/api/employees`, PUT/DELETE `/api/employees/:id` | owner_admin |
| GET/POST `/api/shifts` | owner_admin |
| POST `/api/attendances/check-in`, `/check-out` | kasir/owner_admin |
| GET/PUT `/api/settings` | owner_admin (QRIS image, `expiry_alert_days`) |

---

