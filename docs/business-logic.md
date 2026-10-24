# Business Logic / Key Algorithms — Pharmacy POS (Pilot 1)

> Critical stock-changing logic runs inside PostgreSQL functions/RPC so each workflow is atomic. Next.js Route Handlers authenticate, authorize, validate input, and call the appropriate function. See `architecture.md`, `api-contract.md`, and `database-design.md`.

## 1. Global Rules

1. All stock quantities are integers in the product's **base unit**.
2. FEFO = earliest non-expired batch first.
3. `transaction_items` represent what the customer bought; batch sourcing is stored separately in `transaction_item_batches`.
4. Stock-changing workflows are database transactions. Do not emulate a transaction using several independent Supabase HTTP calls.
5. Business dates use `Asia/Jakarta`; timestamps remain UTC.
6. A cashier may only transact against their own currently-open cash drawer session.
7. Database constraints protect structural integrity (product/unit/batch consistency and valid payment-state shapes); RPCs protect multi-row business rules and concurrency.
8. A batch included in an `in_progress` stock-opname session is operationally frozen. Normal stock-changing workflows must reject mutations to that batch until the opname is applied or cancelled.
9. When multiple batch rows may be locked, functions must use a deterministic ordering to reduce deadlock risk.

---

## 2. Checkout — FEFO + Atomic Stock Deduction

Core of `POST /api/transactions/checkout`.

The transaction header **must exist before** any `transaction_items` rows are inserted because `transaction_items.transaction_id` is a foreign key to `transactions.id`.

```text
Route Handler
  -> authenticate cashier
  -> validate request schema
  -> call checkout_transaction(...) RPC

checkout_transaction RPC
BEGIN
  1. Resolve employee from authenticated user.
  2. Validate cash_drawer_session:
       - exists
       - closed_at IS NULL
       - belongs to current employee
  3. Load requested products + product units.
  4. Validate each product/unit relationship and active state.
  5. Compute quantity_in_base = quantity_in_unit * conversion_to_base.
  6. If a prescription-required product exists, require prescription data.
  7. Resolve authoritative selling price/tax and calculate every line plus
     subtotal/tax/total before inserting sale rows. Never trust client totals.
  8. Lock all candidate batches required by the cart in deterministic order.
     After each target batch is locked, re-check that it is not part of an
     in_progress stock-opname session.

     Eligible sale batches must satisfy:
       product_id = requested product
       quantity > 0
       expired_date >= business_date

     FEFO ordering:
       product_id ASC, expired_date ASC, created_at ASC, id ASC

     If a required batch is frozen:
       RAISE STOCK_OPNAME_IN_PROGRESS

     If total eligible quantity < requested base quantity:
       RAISE INSUFFICIENT_STOCK

     Build the FEFO allocation plan while the locks are held.
  9. Generate transaction UUID and concurrency-safe invoice number inside
     the same transaction using invoice_sequences.
 10. INSERT transaction header with already-calculated authoritative totals:
       cash -> status='completed', payment_confirmed_at=now(),
               payment_confirmed_by=current employee
       qris -> status='pending_payment', payment_confirmed_at=NULL,
               payment_confirmed_by=NULL
 11. For each cart line:
       INSERT one transaction_items row, including authoritative
       `product_name_snapshot` and `unit_name_snapshot` for the receipt.
       For each planned FEFO allocation:
         INSERT transaction_item_batches(
           transaction_item_id,
           product_id,
           batch_id,
           quantity_in_base,
           cost_price_snapshot
         )
         UPDATE product_batches
         SET quantity = quantity - allocated_quantity
         WHERE id = batch_id;
 12. INSERT prescription row if required.
COMMIT
```

If any validation, insert, or stock update fails, the entire PostgreSQL transaction rolls back, including the invoice-sequence increment.

### Why batch allocation is separate

Example: 1 Box = 100 tablets. Batch A has 30 tablets and Batch B has 200 tablets.

Customer buys **1 Box**:

```text
transaction_items
  quantity_in_unit = 1 Box
  quantity_in_base = 100

transaction_item_batches
  Batch A = 30
  Batch B = 70
```

This avoids fractional sell-unit values such as `0.3 Box` and keeps the receipt/cart model separate from inventory allocation.

---

## 3. Payment Lifecycle

### 3.1 Cash

Cash checkout is immediately completed.

Required shape:

```text
payment_method = cash
status = completed (or voided after a later void)
cash_received >= total_amount
cash_change = cash_received - total_amount
payment_confirmed_at != NULL
payment_confirmed_by != NULL
```

Cash may never be created as `pending_payment`.

### 3.2 QRIS

Pilot 1 QRIS is the pharmacy's external/physical static QRIS at the counter.
It has no payment-gateway callback, app-hosted QRIS image, polling, or
automatic verification, so payment confirmation is manual.

Pilot 1 does not generate a QR code or verify payment automatically. The
customer pays using the pharmacy's externally available QRIS, and the cashier
manually confirms the payment in the POS. Inventory is already deducted while
the transaction is `pending_payment`.

```text
checkout with QRIS
  -> stock deducted atomically
  -> status = pending_payment
  -> payment confirmation fields are NULL
  -> customer scans the external counter QRIS
  -> cashier verifies payment externally
  -> POST /api/transactions/:id/confirm-payment
  -> database transition pending_payment -> completed
```

Rules:

- Only `pending_payment` QRIS transactions can be confirmed.
- `payment_confirmed_at` and `payment_confirmed_by` are written together on confirmation.
- Sales/revenue reports include only `completed` transactions.
- A pending QRIS transaction may be voided to release stock if payment is abandoned.
- Confirmation and void lock/check the same transaction row. The first transition wins.
- A confirmed QRIS transaction cannot be voided. Reversal of a paid QRIS sale must use customer return/refund.
- QRIS never uses `cash_received` or `cash_change`.
- Pending, completed, and voided QRIS transactions never contribute to the
  physical cash drawer expected balance.

```text
pending_payment
├── confirm -> completed -> return/refund only
└── void    -> voided
```

Database check constraints provide a second layer of protection against invalid payment/status combinations.

---

## 4. Void Transaction

Void restores the stock that was allocated by the sale.

```text
BEGIN
  1. SELECT transaction FOR UPDATE.
  2. Reject if already voided.
  3. Reject confirmed/paid QRIS with PAID_TRANSACTION_REQUIRES_RETURN.
  4. Reject if customer returns already exist for the transaction.
  5. Load original transaction_item_batches in deterministic batch order.
  6. Lock every referenced product_batch.
  7. Re-check each batch is not frozen by an in_progress stock opname.
     If frozen: RAISE STOCK_OPNAME_IN_PROGRESS.
  8. For every allocation:
       UPDATE product_batches
       SET quantity = quantity + allocation.quantity_in_base
       WHERE id = allocation.batch_id;
  9. Set status='voided', voided_at, voided_by, void_reason.
COMMIT
```

A completed transaction that already has a customer return cannot be voided in Pilot 1. Confirmed QRIS cannot be voided even before a return exists; it remains eligible for customer return/refund. These rules prevent incorrect lifecycle history and duplicate stock restoration.

---

## 5. Customer Returns

Customer returns are allowed only from a **completed** transaction. The return records a `refund_method` (`cash` or `qris`). A cash refund additionally records the **currently-open drawer that physically pays the refund**.

Customer Return UI is COMPLETE: completed Cash and completed QRIS sales begin at transaction detail and support partial, repeated/cumulative, and multi-item returns. Pending QRIS, voided sales, and fully returned transactions are not returnable. Mutation uses `quantity_in_base`; sold-unit display uses `conversion_to_base_snapshot`, and non-divisible historical values are not rounded. Product/unit labels use transaction snapshots. `Perkiraan Refund` uses stored sale values only and is not authoritative; PostgreSQL owns final refund, cumulative limits, and original-batch restoration. For cash, the server resolves the authenticated employee's open drawer; the browser cannot choose it. QRIS uses no physical drawer and no gateway refund. Stock-opname freeze applies. Uncertain submissions are not automatically retried; return idempotency remains backlog.

### 5.1 Returnable quantity

For each requested `transaction_item_id`:

```text
returnable_quantity = original transaction_item.quantity_in_base
                    - SUM(previous customer return_items.quantity_in_base)
```

Reject if requested quantity exceeds `returnable_quantity`.

Batch restoration follows the original sale allocations. If the original line came from multiple batches, the return is restored against those original allocations without exceeding the quantity originally drawn from each batch after accounting for previous returns.

### 5.2 Cash refund drawer rule

A refund is associated with the drawer that pays it **now**, not the drawer used by the original sale.

```text
customer return + refund_method=cash
  -> cash_drawer_session_id REQUIRED
  -> drawer must be open
  -> drawer must belong to processed_by/current authenticated employee

customer return + refund_method=qris
  -> cash_drawer_session_id MUST be NULL

supplier return
  -> cash_drawer_session_id MUST be NULL
```

Example: a sale made yesterday may be returned today. The cash physically leaves today's drawer, so today's drawer must receive the refund entry.

### 5.3 Atomic return

```text
BEGIN
  1. Lock original transaction and requested transaction_items.
  2. Validate transaction status='completed'.
  3. For cash refund, validate the submitted current drawer ownership/open state.
  4. Lock relevant original allocation rows / target product_batches.
  5. Re-check each target batch is not frozen by stock opname.
  6. Recompute previous customer returns while locks are held.
  7. Reject if cumulative return would exceed sold quantity/allocation.
  8. Allocate returned quantity back to original batches.
  9. INSERT returns header, including refund_method and current refund drawer
     when applicable.
 10. INSERT return_items and return_item_batches with original cost snapshots.
 11. Increment product_batches.quantity.
 12. Snapshot refund_subtotal / refund_tax / refund_total.
COMMIT
```

Financial effect:

- customer refund reduces net sales
- returned batch cost reverses COGS
- stock is added back to original batch(es)
- cash refund reduces the expected balance of the drawer that paid the refund

Refund values are stored as snapshots so historical reports do not change if product prices later change.

---

## 6. Supplier Returns

Supplier Return Backend is implemented; Supplier Return UI is deferred.

Supplier returns are inventory movements, not customer sales refunds.

```text
BEGIN
  1. Validate product/batch relationship.
  2. Lock selected product_batch.
  3. Re-check the batch is not frozen by stock opname.
  4. Validate sufficient batch quantity.
  5. Decrement product_batches.quantity.
  6. INSERT returns(source='supplier').
  7. INSERT return_items and return_item_batches.
COMMIT
```

Supplier returns do not reduce sales revenue and never reference a cash drawer.

---

## 7. Cash Drawer

### 7.1 Open

Only one open drawer per active `kasir`/`owner_admin` is allowed. The atomic
`open_cash_drawer` RPC locks the employee row, rejects a second open session,
validates a non-negative opening balance, and creates the session for the
server-derived employee identity.

### 7.2 Checkout validation

Every checkout must verify that the submitted session belongs to the authenticated cashier and is still open.

### 7.3 Cash-refund validation

Every cash customer return must verify that `returns.cash_drawer_session_id` belongs to the authenticated processor and is still open at the time of the refund.

### 7.4 Close

`close_cash_drawer` locks the drawer before calculating and persisting the
closing snapshot. Checkout and cash-refund RPCs lock that same row, so a
concurrent mutation either commits before the calculation or observes the
closed drawer and fails.

```text
cash_sales = SUM(total_amount)
  WHERE cash_drawer_session_id = :id
    AND payment_method = 'cash'
    AND status = 'completed'

customer_cash_refunds = SUM(returns.refund_total)
  WHERE source = 'customer'
    AND refund_method = 'cash'
    AND cash_drawer_session_id = :id

closing_balance_expected = opening_balance + cash_sales - customer_cash_refunds
variance = closing_balance_actual - closing_balance_expected
```

**Do not** assign a refund to the original transaction's drawer. A historical drawer may already be closed and did not physically pay today's refund.

For `refund_method = qris`, the refund is handled manually outside payment-gateway integration and does not reduce physical cash in the drawer.

Cashier lifecycle is `login -> open drawer -> transact -> close drawer`.
General checkout idempotency keys remain a production backlog item for safe
network retries; they are not part of drawer lifecycle implementation.

The cashier workspace is available only while the server-derived employee has
an open drawer. Product search returns active products, sell units, and an
informational aggregate of usable batch stock. Cart state remains browser
memory only and stores product/unit display snapshots—not batches or FEFO
allocations. Displayed stock, price, and subtotal are previews; the checkout
RPC remains authoritative and may reject stock that changed concurrently.

---

## 8. Profit & Loss

For a period using Asia/Jakarta business dates:

```text
gross_sales = SUM(completed transactions.total_amount)
customer_refunds = SUM(customer returns.refund_total)
net_sales = gross_sales - customer_refunds

sale_cogs = SUM(transaction_item_batches.quantity_in_base * cost_price_snapshot)
  for completed transactions

returned_cogs = SUM(return_item_batches.quantity_in_base * cost_price_snapshot)
  for customer returns

net_cogs = sale_cogs - returned_cogs
operational_expenses = SUM(operational_expenses.amount)

net_profit = net_sales - net_cogs - operational_expenses
```

Tax presentation (tax-inclusive vs pre-tax revenue) remains a reporting decision and must be explicit in the report response.

---

## 9. Stock Opname — Batch Freeze Policy

Pilot 1 uses **batch-level stock opname with operational freeze**. This deliberately favors auditability and implementation simplicity over allowing continuous sales on a batch while it is being counted.

### 9.1 Start session

Only one `in_progress` stock-opname session is allowed globally in Pilot 1.

```text
BEGIN
  1. Create stock_opname_session(status='in_progress').
  2. Resolve all batches in scope (optionally by storage location).
  3. Lock those product_batches in deterministic order.
  4. Snapshot each batch:
       system_quantity = current batch quantity
       physical_quantity = NULL
  5. The created stock_opname_items now mark those batches as frozen.
COMMIT
```

### 9.2 Freeze rule for other stock mutations

Checkout, void, customer return, supplier return, and manual batch-stock changes that touch a frozen batch must reject with:

```text
STOCK_OPNAME_IN_PROGRESS
```

To close the race between a new mutation and a newly-started opname, a stock-changing RPC must:

```text
lock target product_batch
-> re-check whether that batch belongs to an in_progress stock_opname_session
-> only then mutate stock
```

This ensures:

- if a sale gets the batch lock first, it completes before the opname snapshot is taken;
- if the opname gets the lock first, the later sale sees the committed freeze and is rejected.

### 9.3 Counting

- User enters `physical_quantity` per batch.
- UI may group rows by product for convenience.
- An item is not considered counted while `physical_quantity IS NULL`.
- Counting changes only the opname item, never live batch stock.

### 9.4 Apply

```text
BEGIN
  1. Lock stock_opname_session.
  2. Reject if status != in_progress.
  3. Reject if any item has physical_quantity IS NULL.
  4. Lock all referenced product_batches in deterministic order.
  5. Verify all items still belong to this active session.
  6. SET each batch.quantity = item.physical_quantity.
     This assignment is safe because those batches were frozen from snapshot
     through apply; no normal stock mutation was allowed in between.
  7. Set session status='applied', applied_at, applied_by.
COMMIT
```

### 9.5 Cancel

An opname may be cancelled before apply:

```text
BEGIN
  lock session
  require status='in_progress'
  set status='cancelled', cancelled_at, cancelled_by
COMMIT
```

Cancellation performs **no stock adjustment** and releases the operational freeze because the session is no longer `in_progress`.

Unknown/new physical stock that has no known batch should be entered through manual batch stock entry outside an active opname for that batch rather than silently assigned to an arbitrary batch.

---

## 10. Invoice Number Generation

Invoice numbers are generated **inside the checkout database transaction**, not by reading the last invoice in application code.

The cash checkout UI shows estimated totals and change only as previews.
`checkout_transaction()` remains authoritative, and the cart is cleared only
after its successful result. Opening a cashier session redirects to
`/cashier`.

Checkout has no idempotency key in Pilot 1. The browser must never retry a
submitted checkout automatically; an uncertain network response requires the
cashier to verify recent transactions first.

Customer receipts are read-only projections of the stored transaction and
transaction items. Product and unit labels come from their transaction-time
snapshots, so later master-data renames cannot alter an old receipt. Cart
previews are never used to reconstruct a final receipt.
Pilot 1 printing uses the browser print dialog; native thermal/ESC-POS
integration remains a future enhancement.

## 11. Transaction History & Receipt Reprint

Transaction history is a read-only operational view. It lists newest stored
transactions first with server-side pagination and validated invoice, date,
payment-method, and status filters. Date boundaries use Asia/Jakarta. Detail
and receipt displays use stored financial fields and immutable
`product_name_snapshot` / `unit_name_snapshot` values, never current master
labels. Reprint links reuse `/transactions/:id/receipt` and its browser-print
implementation; history does not alter a transaction or expose status editing.

## 12. Barcode Lookup

Pilot 1 barcode scanning is keyboard-wedge/manual input: barcode text followed
by Enter calls an exact authenticated lookup. Barcode is stored on
`product_units`, so a scan selects that exact sell unit rather than a product
default. Input remains a string (leading zeroes are preserved) and only outer
whitespace/CR/LF is trimmed. The UI adds the resulting `product_unit_id` through
the existing cart action; it neither reserves stock nor changes FEFO or
checkout authority. Camera scanning and barcode assignment/editing UI are not
part of this milestone.

Format:

```text
INV-YYYYMMDD-XXXX
```

`YYYYMMDD` is the Asia/Jakarta business date. `invoice_sequences` stores the last sequence for each business date and is atomically incremented so concurrent cashiers cannot generate the same invoice number.
