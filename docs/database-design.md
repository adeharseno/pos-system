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
- **Auth roles**: Supabase Auth `app_metadata.role` (`owner_admin` | `kasir`).
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

### 2.4 Cash refund drawer

A customer cash refund references the **drawer session that actually pays the refund**, not the drawer from the original transaction.

`returns.cash_drawer_session_id` rules:

- customer + cash refund: required
- customer + QRIS/manual non-cash refund: null
- supplier return: null

Ownership/open-session validation remains an RPC rule because it spans `returns`, `cash_drawer_sessions`, and the authenticated employee.

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
categories ──< subcategories ──< products ──< product_units
                                   │
                                   └──< product_batches

employees ──< user_profiles
employees ──< shifts ──< attendances
employees ──< cash_drawer_sessions

transactions ──< transaction_items ──< transaction_item_batches >── product_batches
transactions ──< transaction_prescriptions
transactions ──< returns ──< return_items ──< return_item_batches >── product_batches
cash_drawer_sessions ──< returns  # only customer cash refunds

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

- `id`
- `name`
- `description`
- `display_order`
- `is_active`
- timestamps

#### `subcategories`

- `id`
- `category_id`
- `name`
- `display_order`
- `is_active`
- timestamps

A composite uniqueness key supports a DB-level guarantee that a product's `subcategory_id` belongs to its `category_id`.

#### `products`

Important fields:

- `sku`
- `name`
- `generic_name`
- `category_id`
- `subcategory_id`
- `drug_classification`
- generated `requires_prescription`
- `base_unit`
- `tax_rate` constrained to 0..100
- `minimum_stock >= 0`
- `storage_location_id`
- `default_supplier_id`
- `is_active`

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
- `UNIQUE (id, product_id)` for composite FK targets

FEFO index: product + expiry date for batches with positive quantity.

---

## 5. Employees & Cash Drawer

### `employees`

Operational employee profile. Only positions that need login are linked to Supabase Auth.

### `user_profiles`

1:1 bridge from `auth.users.id` to `employees.id`.

### `cash_drawer_sessions`

- one open session per employee (partial unique index)
- opening balance
- expected closing balance
- actual closing balance
- variance
- timestamps

Checkout RPC must validate ownership of the drawer session, not trust a client-provided UUID.

For customer **cash refunds**, the return RPC must validate `returns.cash_drawer_session_id` the same way. Drawer close subtracts only cash refunds whose `returns.cash_drawer_session_id` equals that drawer.

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
- `cash_drawer_session_id`
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
- `quantity_in_unit`
- `conversion_to_base_snapshot`
- `quantity_in_base`
- `unit_price`
- `tax_rate_snapshot`
- `subtotal`
- `tax_amount`
- `total_amount`

The composite FK `(product_unit_id, product_id)` guarantees the chosen sell unit belongs to the item product.

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
- `cash_drawer_session_id` only when a customer cash refund is physically paid from that drawer
- `reason`
- `processed_by`
- refund subtotal/tax/total snapshots
- `business_date`
- timestamp

A check constraint enforces the source/refund/drawer shape. Open-drawer ownership is validated atomically by the return RPC.

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
- Cash drawer expected balance subtracts customer cash refunds by **refund drawer**, not original sale drawer.
- Supplier returns are inventory movements and do not reduce sales revenue.

---

## 10. Integrity Rules

Database-level protections include:

- no negative product batch quantity
- no negative money fields where inappropriate
- tax rate constrained to 0..100
- product subcategory must belong to selected category
- product/unit/batch consistency through composite foreign keys
- unique SKU and unit barcode
- at most one base unit per product
- one open cash drawer per employee
- only one globally in-progress stock-opname session in Pilot 1
- invoice number unique
- batch uniqueness by product + batch number + expiry
- stock-opname item unique per session + batch
- valid transaction payment/status/confirmation shape
- valid transaction void metadata shape
- valid customer/supplier return refund/drawer shape
- updated timestamps maintained through triggers for mutable tables

Business rules that span multiple rows/tables (cumulative return quantity, drawer ownership, valid state transitions under concurrency, FEFO allocation, stock-opname freeze checks) belong in RPC functions because they require locks/transaction context.

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
- purchase orders/goods receipt workflow
- multi-branch / `outlet_id`
- payroll
- CRM/loyalty
- offline sync

These are future-phase decisions, not placeholders to implement now.
