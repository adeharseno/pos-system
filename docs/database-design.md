# Database Design — Pharmacy POS (Pilot 1)

> Source of truth for tables, relations, constraints, and transaction data modeling. See `architecture.md`, `api-contract.md`, and `business-logic.md`.

## 1. General Conventions

- **Database**: PostgreSQL on Supabase.
- **IDs**: UUID via `gen_random_uuid()` unless otherwise stated.
- **Timestamps**: `timestamptz`, stored in UTC.
- **Business timezone**: `Asia/Jakarta` for invoice date, daily grouping, and operational date boundaries.
- **Money**: `numeric(14,2)`.
- **Stock quantity**: integer in the product's base unit.
- **Transactions are immutable history**: no hard delete of sales, returns, or stock-opname history.
- **Master data deactivation**: use `is_active` rather than deleting referenced records.
- **Authorization roles**: `employees.position` (`owner_admin` | `kasir` | `staf`) after resolving `auth.users -> user_profiles -> employees`; Auth `app_metadata` is not the role authority.
- **Critical stock mutations**: performed in PostgreSQL functions/RPC with row locking and a single DB transaction.
- **Defense in depth**: RPCs enforce multi-row/concurrency business rules; foreign keys/check constraints reject structurally impossible row combinations even if application code is wrong.

---

## 2. Key Modeling Decisions

### 2.1 Cart line vs batch allocation

`transaction_items` represents what the customer bought. `transaction_item_batches` represents where the stock came from.

```text
transactions
  └─ transaction_items                  # 1 row per cart/receipt line
       └─ transaction_item_batches      # 1..N FEFO source batches
            └─ product_batches
```

This allows one Box to be fulfilled by multiple batches without inventing fractional Box quantities.

### 2.2 Structural product consistency

Rows that carry both a product identifier and a related unit/batch use **composite foreign keys** so the database guarantees that the referenced unit or batch belongs to the same product.

Required parent keys:

```text
product_units    UNIQUE (id, product_id)
product_batches  UNIQUE (id, product_id)
transaction_items UNIQUE (id, product_id)
return_items       UNIQUE (id, product_id)
```

Examples of enforced relationships:

```text
transaction_items(product_unit_id, product_id)
  -> product_units(id, product_id)

transaction_item_batches(transaction_item_id, product_id)
  -> transaction_items(id, product_id)
transaction_item_batches(batch_id, product_id)
  -> product_batches(id, product_id)

return_items(transaction_item_id, product_id)
  -> transaction_items(id, product_id)   # nullable for supplier returns

return_item_batches(return_item_id, product_id)
  -> return_items(id, product_id)
return_item_batches(batch_id, product_id)
  -> product_batches(id, product_id)

stock_opname_items(batch_id, product_id)
  -> product_batches(id, product_id)
```

Therefore rows such as “Panadol item using an Amoxicillin unit/batch” cannot be persisted.

### 2.3 Return line vs batch restoration

```text
returns
  └─ return_items
       └─ return_item_batches
            └─ product_batches
```

Customer returns reference the original `transaction_item_id`; batch restoration is recorded separately and uses original sale allocations.

### 2.4 Customer refunds

Customer returns reference the original `transaction_id` and record a `refund_method`
(`cash` or `qris`). The refund total and item quantities are always recalculated
against the original sale, so a refund never references a physical drawer.

### 2.5 QRIS/payment state

Transaction status values:

- `pending_payment` — QRIS created, stock deducted, manual payment confirmation not yet received.
- `completed` — cash sale or confirmed QRIS sale.
- `voided` — transaction cancelled and stock restored.

Only `completed` transactions contribute to sales revenue.

Database constraints enforce valid state shapes, including:

- cash can never be `pending_payment`
- cash requires `cash_received`, exact `cash_change`, and confirmation actor/time
- QRIS never stores cash tender/change
- QRIS `pending_payment` has no confirmation actor/time
- QRIS `completed` has confirmation actor/time
- QRIS `voided` has no confirmation actor/time; only unconfirmed pending QRIS may be voided
- confirmation actor/time are always both null or both non-null
- `voided` requires void actor/time/nonblank reason; non-voided rows cannot carry void metadata

The lifecycle is `pending_payment -> completed` through confirmation or
`pending_payment -> voided` through cancellation. A confirmed QRIS sale is
reversed using customer return/refund and can never transition to `voided`.

### 2.6 Invoice concurrency

`invoice_sequences` stores one sequence counter per Asia/Jakarta business date. Invoice generation happens inside the checkout DB transaction.

### 2.7 Stock-opname freeze

Pilot 1 allows only one globally `in_progress` stock-opname session. Its `stock_opname_items` identify the batches that are operationally frozen.

Normal stock-changing RPCs must lock each target batch and then re-check whether it belongs to an `in_progress` opname before mutating stock. Applying or cancelling the session releases the freeze by changing session status.

---

## 3. Entity Relationship Diagram (abbreviated)

```text
categories ──< products >── subcategories
                    │
                    └──< product_units

suppliers ──< purchase_invoices ──< purchase_invoice_items ──< product_batches
                    │
                    └──< products (default_supplier_id)

employees ──< user_profiles
employees ──< shifts ──< attendances

transactions ──< transaction_items ──< transaction_item_batches >── product_batches
transactions ──< transaction_prescriptions
transactions ──< returns ──< return_items ──< return_item_batches >── product_batches

stock_opname_sessions ──< stock_opname_items >── product_batches

invoice_sequences
operational_expenses
app_settings
```

---

## 4. PostgreSQL Schema

The executable base schema is `supabase/migrations/0001_init.sql`. Important tables are summarized below.

### 4.1 Products

#### `categories`

UI label: **Kategori**.

- `id`
- `name`
- `description`
- `display_order`
- `is_active`
- timestamps

Legacy values: Obat Bebas, Obat Resep, Racik, Psikotropika.

#### `subcategories`

UI label: **Subkategori**.

- `id`
- `name`
- `display_order`
- `is_active`
- timestamps

There is **no** `category_id` and no parent/child relationship. Category and
subcategory are two independent lookup lists; the same subcategory may be used
by products under different categories. Name uniqueness is enforced on
`lower(btrim(name))` within each table.

Legacy values: Syrup, Tablet, Injeksi, Infus, Alkes, Supp, Cream, Obat Tetes,
Bebas.

#### `products`

Important fields:

- `sku`
- `name`
- `generic_name`
- `category_id` (nullable FK to `categories`)
- `subcategory_id` (nullable FK to `subcategories`)
- `drug_classification`
- generated `requires_prescription`
- `base_unit`
- `tax_rate` constrained to 0..100
- `minimum_stock >= 0`
- `storage_location_id`
- `default_supplier_id`
- `is_active`

Any category/subcategory combination is allowed; there is no check that the
subcategory belongs to the category.

#### `product_units`

- `product_id`
- `unit_name`
- `conversion_to_base > 0`
- `selling_price >= 0`
- `barcode`
- `is_base_unit`
- `UNIQUE (id, product_id)` for composite FK targets

At most one base unit is enforced by a partial unique index; application validation requires exactly one active base unit and `conversion_to_base = 1`.

#### `product_batches`

- `product_id`
- `batch_number`
- `expired_date`
- `quantity >= 0` in base unit
- `cost_price >= 0`
- `received_date`
- `purchase_invoice_item_id` (nullable FK to `purchase_invoice_items`, `ON DELETE RESTRICT`, indexed)
- `UNIQUE (id, product_id)` for composite FK targets

FEFO index: product + expiry date for batches with positive quantity.

`purchase_invoice_item_id` is nullable on purpose: opening stock from migrations and stock-opname adjustment batches have no purchase invoice. Batches created by invoice receiving store their source item, so they can be traced to `purchase_invoices.supplier_id`. Returning stock to a supplier is derived through this chain, not through a `supplier_id` on `returns`.

---

### 4.2 Suppliers and purchase traceability

#### `suppliers`

- `id`
- `legacy_code` (nullable, unique when not null; maps old SASPoS supplier codes to UUIDs)
- `name` (not unique at the database level)
- `contact_person`
- `phone`
- `address`
- `license_number`
- `is_active`
- timestamps

Application validation rejects a new or edited supplier whose
`lower(btrim(name))` matches another **active** supplier. Inactive rows are
ignored, and legacy duplicate names can be imported as-is. Deleting a supplier
is a soft delete (`is_active = false`).

`scripts/import-suppliers.ts` upserts `data/legacy/supplier.csv` by
`legacy_code`, ignores debt columns, and preserves manual `is_active` changes on
reruns. `LARUTAN` and `GUDANG` are imported as inactive internal suppliers.

#### `purchase_invoices` / `purchase_invoice_items`

`purchase_invoices.supplier_id` is `NOT NULL` with `ON DELETE RESTRICT`.
`purchase_invoice_items.invoice_id` references the invoice. The receiving RPC
creates or reuses a stock batch for each invoice item group and, for a newly
created batch, sets `product_batches.purchase_invoice_item_id` to its source
item. Existing batches are not re-attributed because they may already contain
opening stock or stock from another supplier.

Traceability chain:

```text
suppliers <- purchase_invoices.supplier_id <- purchase_invoice_items <- product_batches.purchase_invoice_item_id
```

#### `batch_supplier` (read-only view)

Columns: `batch_id`, `product_id`, `supplier_id`, `invoice_id`,
`invoice_number`, `received_at`. It is a `LEFT JOIN` chain, so every batch is
returned: opening-stock and stock-opname batches have `supplier_id = NULL`,
`invoice_id = NULL`, and `invoice_number = NULL`. `received_at` is the batch
creation timestamp. Only `service_role` may read the view.

---

## 5. Employees

### `employees`

Operational employee profile. Only positions that need login are linked to Supabase Auth.

### `user_profiles`

1:1 bridge from `auth.users.id` to `employees.id`.

---

## 6. Sales

### `invoice_sequences`

```text
business_date (PK)
last_number
```

Used only from the checkout DB transaction.

### `transactions`

Important fields:

- `invoice_number` unique
- `business_date`
- `cashier_id`
- subtotal/tax/total snapshots
- `payment_method`
- cash received/change
- payment confirmation actor/time
- `status`
- void actor/time/reason
- timestamps

Payment and void lifecycle check constraints reject impossible state combinations independently of RPC validation.

### `transaction_items`

One row per customer-facing sale line:

- `transaction_id`
- `product_id`
- `product_unit_id`
- `product_name_snapshot`
- `unit_name_snapshot`
- `quantity_in_unit`
- `conversion_to_base_snapshot`
- `quantity_in_base`
- `unit_price`
- `discount_amount`
- `tax_rate_snapshot`
- `subtotal`
- `tax_amount`
- `total_amount`

The composite FK `(product_unit_id, product_id)` guarantees the chosen sell unit belongs to the item product.

Customer-facing product and unit labels are copied from the authoritative master
records by the checkout RPC and are immutable receipt snapshots. Migration
`0005_transaction_item_receipt_snapshots.sql` backfills older rows with the
best labels available at migration time; the original labels cannot be
reconstructed if master data had already changed before that migration.

No `batch_id` lives here.

### `transaction_item_batches`

One or more rows per transaction item:

- `transaction_item_id`
- `product_id`
- `batch_id`
- `quantity_in_base`
- `cost_price_snapshot`

Composite FKs guarantee both the transaction item and batch belong to the same `product_id`. COGS is calculated from these rows, not from the product's current cost price.

---

## 7. Returns

### `returns`

Header:

- `source` (`customer` | `supplier`)
- `transaction_id` for customer returns
- `refund_method` (`cash` / `qris`) for customer returns
- `reason`
- `processed_by`
- refund subtotal/tax/total snapshots
- `business_date`
- timestamp

A check constraint enforces the source/refund shape. Return lifecycle, cumulative
quantity, batch restoration, and freeze checks are validated atomically by the return RPC.

### `return_items`

- `return_id`
- `product_id`
- `transaction_item_id` for customer returns
- `quantity_in_base`
- refund subtotal/tax/total snapshots

When `transaction_item_id` is present, a composite FK guarantees it belongs to the same product.

### `return_item_batches`

- `return_item_id`
- `product_id`
- `batch_id`
- `quantity_in_base`
- `cost_price_snapshot`

Composite FKs ensure the returned batch and return line share the same product.

For customer returns, these rows must map back to the original `transaction_item_batches` allocations and cumulative returns may never exceed the original sold allocation. This remains an RPC rule because it requires locking and aggregation of previous returns.

---

## 8. Stock Opname

Pilot 1 uses **batch-level stock opname with operational freeze**.

### `stock_opname_sessions`

- date
- optional storage-location filter
- status: `in_progress` / `applied` / `cancelled`
- created actor/time
- applied actor/time
- cancelled actor/time

A partial unique index allows only one globally `in_progress` session in Pilot 1.

### `stock_opname_items`

One snapshot row per batch:

- `session_id`
- `product_id`
- `batch_id` (required)
- `system_quantity`
- `physical_quantity` nullable while not counted
- generated `variance`
- notes

`(batch_id, product_id)` is a composite FK to `product_batches`, so a snapshot cannot claim the wrong product for a batch.

While the parent session is `in_progress`, its item batches are frozen for checkout, void, returns, and manual stock mutations. Apply is rejected until every row has a physical count. Cancel applies no quantity changes.

---

## 9. Finance

### `operational_expenses`

Manual operational expense entries used by P&L.

### Reporting formulas

- Gross sales = completed transactions.
- Customer refunds reduce sales.
- Sale COGS = transaction batch allocations × cost snapshot.
- Returned COGS reverses COGS using return batch allocation cost snapshots.
- Supplier returns are inventory movements and do not reduce sales revenue.

---

## 10. Integrity Rules

Database-level protections include:

- no negative product batch quantity
- no negative money fields where inappropriate
- tax rate constrained to 0..100
- product category and subcategory are independent lookup references
- product/unit/batch consistency through composite foreign keys
- unique SKU and unit barcode
- at most one base unit per product
- only one globally in-progress stock-opname session in Pilot 1
- invoice number unique
- batch uniqueness by product + batch number + expiry
- supplier legacy codes unique when not null (supplier names are validated in the application, not by a unique constraint)
- invoiced batches reference their source purchase invoice item; supplier is derived through that chain
- stock-opname item unique per session + batch
- valid transaction payment/status/confirmation shape
- valid transaction void metadata shape
- valid customer/supplier return source/refund shape
- updated timestamps maintained through triggers for mutable tables

Business rules that span multiple rows/tables (cumulative return quantity, valid state transitions under concurrency, FEFO allocation, stock-opname freeze checks) belong in RPC functions because they require locks/transaction context.

---

## 11. Row Level Security

All operational tables have RLS enabled. Direct `anon` / `authenticated` access is denied by default because application data access flows through authenticated Next.js Route Handlers using the server-side service-role client.

This is defense-in-depth; Route Handlers must still authenticate and authorize every request before calling service-role operations.

Storage has separate bucket policies for signed/direct browser uploads.

---

## 12. Auth Model

```jsonc
{
  "role": "owner_admin" | "kasir",
  "employee_id": "uuid-employee"
}
```

- Middleware protects page groups for UX/navigation.
- API Route Handlers re-check the session and role.
- Database mutation functions receive/resolve the employee identity only after server-side authentication.

---

## 13. Deliberately Not Modeled in Pilot 1

No schema for:

- payment gateway references/webhooks
- granular permission matrix
- formal approval workflow
- purchase orders (goods receiving is modeled through purchase invoices)
- multi-branch / `outlet_id`
- payroll
- CRM/loyalty
- offline sync

These are future-phase decisions, not placeholders to implement now.
