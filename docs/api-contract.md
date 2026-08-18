# API Contract — Pharmacy POS (Pilot 1)

> HTTP boundary for the modular monolith. Route Handlers authenticate, authorize, validate, then call domain services or atomic PostgreSQL RPCs. See `architecture.md` and `business-logic.md`.

## 1. General Contract

Base path: `/api`.

Success:

```json
{ "ok": true, "data": {} }
```

Error:

```json
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "Safe message" } }
```

Every implemented handler resolves the active employee from the verified
server session. Browser-supplied employee, role, or auth-user identifiers are
never authoritative, and browser roles cannot execute transactional RPCs
directly.

Typical HTTP statuses: `400`, `401`, `403`, `404`, `409`, `422`, `500`.

Same-origin browser requests use the Supabase session cookie. Every Route Handler independently verifies the session and role.

---

## 2. Products & Master Data

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/products` | both | Search/filter products |
| GET | `/api/products/:id` | both | Product + units + batches |
| GET | `/api/products/lookup?barcode=` | both | Barcode lookup |
| POST | `/api/products` | owner_admin | Create product + units |
| PUT | `/api/products/:id` | owner_admin | Update product + units |
| DELETE | `/api/products/:id` | owner_admin | Deactivate product |

`GET /api/products?q=...` is the cashier search read model. It searches active
products by name or SKU, limits results, includes sell units, prescription
requirement, and informational available base-unit stock. It does not reserve
inventory.
| GET/POST | `/api/categories` | GET both / POST owner_admin | Category list/create |
| PUT/DELETE | `/api/categories/:id` | owner_admin | Update/deactivate |
| POST | `/api/categories/:id/subcategories` | owner_admin | Create subcategory |
| PUT/DELETE | `/api/subcategories/:id` | owner_admin | Update/deactivate |
| GET/POST | `/api/suppliers` | GET both / POST owner_admin | Supplier list/create |
| PUT/DELETE | `/api/suppliers/:id` | owner_admin | Update/deactivate |
| GET/POST | `/api/storage-locations` | GET both / POST owner_admin | Location list/create |

Product validation:

- exactly one base unit
- base-unit conversion = 1
- subcategory belongs to category
- tax rate 0..100
- non-negative minimum stock and prices

---

## 3. Batches & Stock

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/products/:id/batches` | both | All batches including history |
| POST | `/api/products/:id/batches` | owner_admin | Manual stock/batch entry |
| GET | `/api/products/:id/stock-card` | owner_admin | Batch movement history |
| GET | `/api/stock/expiring` | both | Near-expiry batches |
| GET | `/api/stock/low` | both | Products below minimum stock |

Manual batch entry may increment an existing matching product+batch number+expiry row atomically.

---

## 4. Cash Drawer

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/cash-drawer/open` | kasir/owner_admin | Open own drawer session |
| GET | `/api/cash-drawer/current` | kasir/owner_admin | Current employee's open session |
| POST | `/api/cash-drawer/:id/close` | kasir/owner_admin | Close own session and calculate variance |
| GET | `/api/cash-drawer` | owner_admin | Session history |

Open accepts `{ "opening_balance": 100000 }`. Close accepts
`{ "actual_closing_cash": 125000 }`; expected cash and difference are always
calculated by PostgreSQL. Employee identity is injected from the session, and
`staf` cannot operate a cash drawer.

A cashier cannot open a second active session and cannot transact against another employee's drawer session.

---

## 5. Transactions

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/transactions/checkout` | kasir/owner_admin | Atomic checkout RPC |
| POST | `/api/transactions/:id/confirm-payment` | kasir/owner_admin | `pending_payment` QRIS -> `completed` |
| POST | `/api/transactions/:id/void` | kasir/owner_admin | Atomic void + stock restore |
| GET | `/api/transactions` | both | List/filter transactions |
| GET | `/api/transactions/:id` | both | Detail + item/batch allocations + prescription |
| GET | `/api/transactions/:id/receipt` | both | Structured receipt payload |

### 5.1 Checkout request

```jsonc
{
  "cash_drawer_session_id": "uuid",
  "items": [
    { "product_id": "uuid", "product_unit_id": "uuid", "quantity": 2 }
  ],
  "prescription": {
    "prescription_number": "RX-001",
    "doctor_name": "dr. Andi",
    "patient_name": "Budi",
    "photo_url": "https://..."
  },
  "payment_method": "cash",
  "cash_received": 50000
}
```

The client does **not** submit authoritative prices, tax, cost, invoice number, or batch IDs. The server/database resolves those values.

### 5.2 Checkout response

```jsonc
{
  "ok": true,
  "data": {
    "transaction_id": "uuid",
    "invoice_number": "INV-20260814-0007",
    "subtotal": 45000,
    "tax_amount": 4950,
    "total_amount": 49950,
    "cash_change": 50,
    "status": "completed",
    "items": [
      {
        "transaction_item_id": "uuid",
        "product_id": "uuid",
        "product_unit_id": "uuid",
        "quantity": 1,
        "quantity_in_base": 100,
        "batch_allocations": [
          { "batch_id": "uuid-a", "quantity_in_base": 30 },
          { "batch_id": "uuid-b", "quantity_in_base": 70 }
        ]
      }
    ]
  }
}
```

Cash checkout returns `completed`. QRIS checkout returns `pending_payment` until manually confirmed.

Special errors include:

- `409 INSUFFICIENT_STOCK`
- `409 CASH_DRAWER_NOT_OPEN`
- `409 CASH_DRAWER_MISMATCH`
- `409 STOCK_OPNAME_IN_PROGRESS`
- `409 INVALID_TRANSACTION_STATE`
- `422 PRESCRIPTION_REQUIRED`
- `422 INVALID_PRODUCT_UNIT`
- `422 INSUFFICIENT_CASH`

The checkout RPC calculates authoritative totals first, creates the `transactions` header, and only then inserts `transaction_items` and batch allocations. This ordering is required by the transaction-item foreign key.

### 5.3 Confirm QRIS

`POST /api/transactions/:id/confirm-payment`

No body required unless later audit notes are added. Only QRIS transactions in `pending_payment` may transition to `completed`.

### 5.4 Void

```json
{ "reason": "Wrong product entered" }
```

Void is rejected when:

- transaction already voided
- QRIS payment was already confirmed (`PAID_TRANSACTION_REQUIRES_RETURN`); use customer return/refund
- transaction has customer returns
- another conflicting state transition has already completed

---

## 6. Prescriptions & Storage

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/storage/prescription-upload-url` | kasir/owner_admin | Signed upload URL |
| POST | `/api/storage/qris-upload-url` | owner_admin | Signed QRIS image upload URL |

The service-role key is never exposed to the browser.

---

## 7. Returns

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/returns` | customer: kasir/owner_admin; supplier: owner_admin | Atomic customer/supplier return |
| GET | `/api/returns` | both | List/filter returns |
| GET | `/api/returns/:id` | both | Return + batch allocation detail |

### Customer return request

```jsonc
{
  "source": "customer",
  "transaction_id": "uuid",
  "refund_method": "cash",
  "cash_drawer_session_id": "current-open-drawer-uuid",
  "reason": "Damaged product",
  "items": [
    { "transaction_item_id": "uuid", "quantity_in_base": 10 }
  ]
}
```

The API computes cumulative returnability, refund snapshots, COGS reversal, and original-batch restoration. `refund_method` is required for customer returns. For `refund_method = cash`, `cash_drawer_session_id` is also required and must be the authenticated processor's currently-open drawer because that drawer physically pays the refund. For QRIS/manual non-cash refunds it must be omitted/null. Client-provided refund amounts/batch destinations are not authoritative.

Possible errors:

- `409 TRANSACTION_NOT_COMPLETED`
- `409 RETURN_QUANTITY_EXCEEDED`
- `409 TRANSACTION_ALREADY_VOIDED`
- `409 CASH_DRAWER_NOT_OPEN`
- `409 CASH_DRAWER_MISMATCH`
- `409 STOCK_OPNAME_IN_PROGRESS`

### Supplier return request

```jsonc
{
  "source": "supplier",
  "reason": "expired",
  "items": [
    { "product_id": "uuid", "batch_id": "uuid", "quantity_in_base": 50 }
  ]
}
```

---

## 8. Stock Opname

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/stock-opname` | owner_admin | Start batch-level snapshot session |
| GET | `/api/stock-opname/:id` | owner_admin | Session + count status |
| PUT | `/api/stock-opname/:id/items/:itemId` | owner_admin | Enter physical batch quantity |
| POST | `/api/stock-opname/:id/apply` | owner_admin | Atomic apply and release freeze |
| POST | `/api/stock-opname/:id/cancel` | owner_admin | Cancel without stock changes and release freeze |

Start body:

```json
{ "storage_location_id": "optional-uuid" }
```

Starting an opname snapshots and operationally freezes the batches in its scope. Pilot 1 permits only one `in_progress` opname session globally. Checkout, void, returns, and manual stock mutations that touch a frozen batch fail with `409 STOCK_OPNAME_IN_PROGRESS`.

Apply fails with `409 OPNAME_INCOMPLETE` while any row has `physical_quantity = null`. Cancel performs no stock adjustment. Both apply and cancel end the freeze by moving the session out of `in_progress`.

---

## 9. Reports & Finance

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/reports/sales` | owner_admin | Sales report, completed transactions only, net of customer refunds where requested |
| GET | `/api/reports/profit-loss` | owner_admin | Gross sales, refunds, net sales, sale COGS, returned COGS, net COGS, expenses, net profit |
| GET | `/api/reports/stock-value` | owner_admin | Current batch stock value |
| GET/POST | `/api/expenses` | owner_admin | Expense list/create |
| GET | `/api/dashboard/summary` | both | Operational summary |

Period boundaries use Asia/Jakarta business dates.

---

## 10. Employees & Operations

| Method | Endpoint | Role |
|---|---|
| GET/POST `/api/employees`, PUT/DELETE `/api/employees/:id` | owner_admin |
| GET/POST `/api/shifts` | owner_admin |
| POST `/api/attendances/check-in`, `/check-out` | both |
| GET/PUT `/api/settings` | owner_admin |
