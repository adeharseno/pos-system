# API Contract — Pharmacy POS (Pilot 1)

> Part of the Technical Design. Related table schemas are in `database-design.md`. Detailed logic is in `business-logic.md`.

## 6. API Contract (Next.js API Routes)

Base path: `/api`. All success responses: `{ data: ..., error: null }`. All errors: `{ data: null, error: { code, message } }`, HTTP status as appropriate (400/401/403/404/409/422/500).
Required header: `Authorization: Bearer <supabase_access_token>` (read from the Supabase session cookie; no manual header needed for same-origin requests from the client).

### 6.1 Products & Master Data

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/products` | both | List products. Query params: `q` (search by name/SKU), `category_id`, `subcategory_id`, `drug_classification`, `storage_location_id`, `stock_status` (`low`/`out`/`all`), `page`, `limit` |
| GET | `/api/products/:id` | both | Product detail + `product_units[]` + `product_batches[]` (where `quantity > 0`, sorted `expired_date` ASC) |
| GET | `/api/products/lookup?barcode=` | both | Find product by barcode in `product_units.barcode`. Used when scanning at the register. |
| POST | `/api/products` | owner_admin | Create product + `units[]` (at least 1, exactly one must have `is_base_unit=true`) |
| PUT | `/api/products/:id` | owner_admin | Update product + units (upsert) |
| DELETE | `/api/products/:id` | owner_admin | Soft delete: set `is_active=false` (no hard delete, transaction history must be preserved) |
| GET | `/api/categories` | both | List categories + nested subcategories |
| POST | `/api/categories` | owner_admin | Create category |
| PUT/DELETE | `/api/categories/:id` | owner_admin | Update/deactivate category |
| POST | `/api/categories/:id/subcategories` | owner_admin | Create subcategory |
| PUT/DELETE | `/api/subcategories/:id` | owner_admin | Update/deactivate subcategory |
| GET/POST | `/api/suppliers` | owner_admin (GET: both) | List/create supplier |
| PUT/DELETE | `/api/suppliers/:id` | owner_admin | Update/deactivate |
| GET/POST | `/api/storage-locations` | owner_admin (GET: both) | List/create shelf locations |

**Example — `POST /api/products`**
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
    { "unit_name": "Box", "conversion_to_base": 100, "selling_price": 40000, "barcode": "899000113", "is_base_unit": false }
  ]
}
// Response 201
{ "data": { "id": "uuid", "sku": "PCT-500-001", "...": "..." }, "error": null }
```
Server validation: exactly one `units[].is_base_unit = true` and `conversion_to_base = 1` for that unit → `422` if not satisfied.

### 6.2 Batches & Stock

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/products/:id/batches` | both | List product batches (including expired, for history) |
| POST | `/api/products/:id/batches` | owner_admin | Manual stock entry (5.7.1). If `batch_number`+`expired_date` match an existing entry → add to its `quantity`, do not insert a new row |
| GET | `/api/products/:id/stock-card` | owner_admin | Stock card (5.7.2): combined view of transaction_items, return_items, stock_opname_items for a product/batch, sorted by time |
| GET | `/api/stock/expiring` | both | List batches expiring within N days (default from `app_settings.expiry_alert_days`) |
| GET | `/api/stock/low` | both | List products where total active stock < `minimum_stock` |

**Example — `POST /api/products/:id/batches`**
```jsonc
// Request
{ "batch_number": "B240601", "expired_date": "2027-06-01", "quantity": 500, "cost_price": 350, "received_date": "2026-06-20" }
// Response 201
{ "data": { "id": "uuid", "product_id": "uuid", "quantity": 500, "...": "..." }, "error": null }
```

### 6.3 Cashier / Transactions (core)

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/cash-drawer/open` | kasir | Open a shift cash session |
| GET | `/api/cash-drawer/current` | kasir | Active cash session for the logged-in cashier |
| POST | `/api/cash-drawer/:id/close` | kasir | Close session, compute variance |
| GET | `/api/cash-drawer` | owner_admin | All session history |
| POST | `/api/transactions/checkout` | kasir | **Core endpoint**: process a sale transaction (see algorithm 7.1) |
| POST | `/api/transactions/:id/confirm-payment` | kasir | Manually confirm QRIS payment received |
| GET | `/api/transactions` | both | List transactions. Query params: `from`, `to`, `cashier_id`, `payment_method`, `status` |
| GET | `/api/transactions/:id` | both | Transaction detail + items + prescription |
| GET | `/api/transactions/:id/receipt` | both | Formatted data for receipt printing (ESC/POS payload, see 7.3) |
| POST | `/api/transactions/:id/void` | kasir/owner_admin | Void a transaction (7.2) |

**Example — `POST /api/transactions/checkout`**
```jsonc
// Request
{
  "cash_drawer_session_id": "uuid",
  "items": [
    { "product_id": "uuid", "product_unit_id": "uuid", "quantity": 2 },
    { "product_id": "uuid-2", "product_unit_id": "uuid-2", "quantity": 1 }
  ],
  "prescription": {                       // required if any item has requires_prescription = true
    "prescription_number": "RX-001",
    "doctor_name": "dr. Andi",
    "patient_name": "Budi",
    "photo_url": "https://.../prescriptions/xxx.jpg"  // already uploaded to Storage from the client
  },
  "payment_method": "cash",               // "cash" | "qris"
  "cash_received": 50000                  // required if payment_method = cash
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
    "status": "completed",
    "items": [ /* per-batch FEFO breakdown, see 7.1 */ ]
  },
  "error": null
}
```
Special errors: `409 INSUFFICIENT_STOCK`, `422 PRESCRIPTION_REQUIRED`, `422 EXPIRED_BATCH_ONLY`.

> **QRIS stock note**: stock is decremented at checkout creation (step 4 in 7.1), regardless of whether payment has been confirmed. `payment_confirmed_at` stays `NULL` until the cashier hits confirm. This prevents two cashiers from racing for the same stock while one is waiting for a customer to scan.

**Example — `POST /api/transactions/:id/void`**
```jsonc
// Request
{ "reason": "Wrong product entered" }
// Response 200
{ "data": { "transaction_id": "uuid", "status": "voided", "voided_at": "...", "stock_restored": true }, "error": null }
```

### 6.4 Prescriptions & Storage

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/storage/prescription-upload-url` | kasir | Generate a signed upload URL to Supabase Storage (bucket `prescriptions`) so photos are uploaded directly from the client without going through the Next.js server (saves serverless execution) |
| POST | `/api/storage/qris-upload-url` | owner_admin | Signed URL for uploading the static QRIS image |

### 6.5 Returns

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/returns` | owner_admin/kasir | Create a return (customer or supplier), see 7.4 |
| GET | `/api/returns` | both | List returns, filter by `source`, `from`, `to` |
| GET | `/api/returns/:id` | both | Return detail |

**Example — `POST /api/returns` (customer return)**
```jsonc
{
  "source": "customer",
  "transaction_id": "uuid",
  "reason": "Damaged product",
  "items": [
    { "transaction_item_id": "uuid", "quantity_in_base": 10 }
  ]
}
```
**Example — supplier return**
```jsonc
{
  "source": "supplier",
  "reason": "expired",
  "items": [ { "product_id": "uuid", "batch_id": "uuid", "quantity_in_base": 50 } ]
}
```

### 6.6 Stock Opname

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/stock-opname` | owner_admin | Start a new session. Body: `storage_location_id?` → server auto-generates `stock_opname_items` snapshot for all products at that location (or all products if omitted) |
| GET | `/api/stock-opname/:id` | owner_admin | Session detail + items |
| PUT | `/api/stock-opname/:id/items/:itemId` | owner_admin | Enter `physical_quantity` for an item |
| POST | `/api/stock-opname/:id/apply` | owner_admin | Apply all variances to `product_batches.quantity`, set `status='applied'` |

### 6.7 Reports & Finance

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/reports/sales` | owner_admin | Query params: `period` (`daily`/`weekly`/`monthly`/`yearly`) or `from`/`to`, `cashier_id?`, `payment_method?`, `group_by` (`product`/`category`/`none`) |
| GET | `/api/reports/profit-loss` | owner_admin | Query params: `from`, `to` → `{ total_sales, total_cogs, total_expenses, net_profit }` |
| GET | `/api/reports/stock-value` | owner_admin | Current stock value (`sum(quantity * cost_price)` per active batch) |
| GET/POST | `/api/expenses` | owner_admin | List/enter manual operational expenses |
| GET | `/api/dashboard/summary` | both | Transaction count & revenue (today/month/year/all-time) + critical stock + near-expiry (5.2) |

### 6.8 Employees & Operations

| Method | Endpoint | Role |
|---|---|---|
| GET/POST `/api/employees`, PUT/DELETE `/api/employees/:id` | owner_admin |
| GET/POST `/api/shifts` | owner_admin |
| POST `/api/attendances/check-in`, `/check-out` | kasir/owner_admin |
| GET/PUT `/api/settings` | owner_admin (QRIS image, `expiry_alert_days`) |

---
