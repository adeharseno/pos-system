# Business Logic / Key Algorithms — Pharmacy POS (Pilot 1)

> Pseudocode executed inside API Routes. See `api-contract.md` for related endpoints and `database-design.md` for the schema.

## 7. Key Business Algorithms (pseudocode, runs in API Routes)

### 7.1 Checkout — FEFO + Validation (core of `POST /api/transactions/checkout`)

```
BEGIN TRANSACTION (Postgres, via service-role Supabase client inside the request handler)

1. Fetch all product_units & products for items in the request (single join, avoid N+1).
2. Compute quantity_in_base for each item = qty_input * product_units.conversion_to_base.
3. Check requires_prescription: if any item is true AND body.prescription is empty → return 422 PRESCRIPTION_REQUIRED.
4. For each item:
     a. SELECT batches WHERE product_id = X AND quantity > 0 AND expired_date >= CURRENT_DATE
        ORDER BY expired_date ASC FOR UPDATE  -- row lock, prevents race condition across parallel transactions
     b. If total batch quantity < quantity_in_base needed → ROLLBACK, return 409 INSUFFICIENT_STOCK
     c. Allocate in order (FEFO):
          remaining = quantity_in_base
          for batch in batches:
            taken = min(batch.quantity, remaining)
            -> write transaction_item row { batch_id: batch.id, quantity_in_base: taken, cost_price_snapshot: batch.cost_price, ... }
            UPDATE product_batches SET quantity = quantity - taken WHERE id = batch.id
            remaining -= taken
            if remaining == 0: break
5. Compute subtotal, tax_amount (per item: subtotal_item * tax_rate if is_taxable), total_amount.
6. If payment_method == 'cash':
     - validate cash_received >= total_amount, compute cash_change.
     - status = 'completed'
   If payment_method == 'qris':
     - status = 'completed' but payment_confirmed_at = NULL
     - (stock IS decremented in step 4 -- design decision: stock is decremented when checkout is created,
       not when payment is confirmed, so two cashiers don't race for the same stock while waiting for a customer to scan QRIS)
7. INSERT transactions, transaction_items, transaction_prescriptions (if present).
8. Do NOT touch cash_drawer_sessions here (balance is computed on-the-fly at session close, see 7.5).

COMMIT TRANSACTION
9. Return response with per-batch item breakdown.
```

> **Why `FOR UPDATE`**: two cashiers can check out the same product almost simultaneously; without a lock, both can read the same batch quantity before either commits, causing oversell. `FOR UPDATE` on the relevant `product_batches` rows prevents this at the database level.

### 7.2 Void Transaction

```
1. Load transaction by id; if status != 'completed' -> 409 ALREADY_VOIDED.
2. BEGIN TRANSACTION
3. For each transaction_item on this transaction:
     UPDATE product_batches SET quantity = quantity + quantity_in_base WHERE id = batch_id
4. UPDATE transactions SET status='voided', voided_at=now(), voided_by=:employee_id, void_reason=:reason
5. COMMIT
   (No approval required — applied immediately, per PRD 4.2.7. Who and when are recorded for passive audit by Owner/Admin.)
```

### 7.3 Receipt Printing

`GET /api/transactions/:id/receipt` returns structured JSON (not raw ESC/POS bytes) containing the store header, line items with unit/qty/price, subtotal, tax, total, payment method, and change. Conversion to ESC/POS commands is done **client-side** (browser, via Web Serial/WebUSB or a local print service) using a library like `escpos`/`node-thermal-printer` running from the cashier's local machine — the Next.js server does not communicate directly with the printer (per 2.1: print from the cashier's browser).

### 7.4 Returns

```
CUSTOMER RETURN (source=customer):
1. Load transaction_item_id -> get the ORIGINAL batch_id (where the item was drawn from at checkout).
2. Validate quantity_in_base being returned <= quantity_in_base on that transaction_item (no over-return).
3. BEGIN TRANSACTION
   UPDATE product_batches SET quantity = quantity + qty WHERE id = original_batch_id
   INSERT returns, return_items
4. COMMIT
   (Stock always goes back to the ORIGINAL batch, never a new one -- per PRD 5.9)

SUPPLIER RETURN (source=supplier):
1. Validate product_id+batch_id exist and batch has sufficient quantity.
2. BEGIN TRANSACTION
   UPDATE product_batches SET quantity = quantity - qty WHERE id = batch_id
   INSERT returns, return_items
3. COMMIT
   (Does not affect sales reports -- stock reduction only)
```

### 7.5 Cash Drawer Close

```
closing_balance_expected = opening_balance
                          + SUM(transactions.cash_received - transactions.cash_change)
                            WHERE cash_drawer_session_id = :id AND payment_method='cash' AND status='completed'
variance = closing_balance_actual (cashier input) - closing_balance_expected
UPDATE cash_drawer_sessions SET closing_balance_expected=.., closing_balance_actual=.., variance=.., closed_at=now()
```

### 7.6 Profit & Loss Report

```
total_sales    = SUM(transactions.total_amount) WHERE status='completed' AND created_at BETWEEN from/to
total_cogs     = SUM(transaction_items.quantity_in_base * transaction_items.cost_price_snapshot)
                   JOIN transactions WHERE status='completed' AND created_at BETWEEN from/to
total_expenses = SUM(operational_expenses.amount) WHERE expense_date BETWEEN from/to
net_profit     = total_sales - total_cogs - total_expenses
```

(`total_sales` includes tax; to get pre-tax revenue, subtract `tax_amount` — confirm the definition with the Owner at implementation time, see Open Question 10.1 in the PRD regarding report granularity.)

### 7.7 Stock Opname Apply

```
FOR each stock_opname_items WHERE session_id = :id:
  IF batch_id IS NOT NULL:
    UPDATE product_batches SET quantity = physical_quantity WHERE id = batch_id
  ELSE:
    -- not identified per-batch: apply the variance to the nearest-expiry FEFO batch for the product
    -- simplest viable approach for Pilot 1
    apply variance to the nearest-expiry active batch for that product
UPDATE stock_opname_sessions SET status='applied', applied_at=now(), applied_by=:employee_id
```

---
