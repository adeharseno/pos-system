# API Contract — Pharmacy POS (Pilot 1)

> The HTTP boundary of the modular monolith. Implemented Route Handlers authenticate, authorize, validate, and call application services or atomic PostgreSQL RPCs.

## General contract

Base path: `/api`. Success responses are `{ "ok": true, "data": {} }`; failures are `{ "ok": false, "error": { "code": "…", "message": "…" } }`.

The server derives `auth.users -> user_profiles -> employees` and uses the active employee's `position` (`owner_admin`, `kasir`, or `staf`) for authorization. Browser input never supplies authoritative employee ID, drawer ID, invoice number, prices/totals, batch allocation, cash change, or receipt-label snapshots.

## Current implemented API

| Method | Endpoint | Access | Behavior |
|---|---|---|---|
| GET | `/api/products?q=` | owner_admin, kasir | Cashier search by product name or SKU; includes sell units and stock preview. |
| GET | `/api/products?barcode=` | owner_admin, kasir | Exact keyboard-wedge/manual barcode lookup. Barcode belongs to `product_units`, so the selected sell unit is returned. |
| POST | `/api/products` | owner_admin | Create one product and its base selling unit through `create_product_with_base_unit`. |
| PATCH | `/api/products/:id` | owner_admin | Edit supported product master fields or set `is_active=false`; never deletes product. |
| POST | `/api/products/:id/units` | owner_admin | Add a non-base selling unit. |
| PATCH | `/api/products/:id/units/:unitId` | owner_admin | Edit a selling unit; base-unit name/conversion are protected. |
| POST | `/api/products/import/preview` | owner_admin | Parse XLSX/CSV and return validation/master-data resolution preview; no writes. |
| POST | `/api/products/import/commit` | owner_admin | Import validated mapped rows through the atomic product + base-unit RPC; results are reported per row. |
| GET | `/api/inventory?product_id=` | owner_admin, kasir | Read inventory/batches for one product. |
| POST | `/api/cash-drawer/open` | owner_admin, kasir | Open the caller's cash-drawer session. |
| GET | `/api/cash-drawer/current` | owner_admin, kasir | Read the caller's open session. |
| POST | `/api/cash-drawer/:id/close` | owner_admin, kasir | Close caller's session; PostgreSQL calculates expected cash and variance. |
| POST | `/api/transactions/checkout` | owner_admin, kasir | Atomic cash or manual-QRIS checkout. |
| — | `/transactions` | owner_admin, kasir | Server-rendered read-only history with validated URL filters and pagination; no duplicate list API. |
| POST | `/api/transactions/:id/confirm-payment` | owner_admin, kasir | Confirm a pending QRIS payment manually. |
| POST | `/api/transactions/:id/void` | owner_admin, kasir | Void an eligible transaction and restore stock atomically. |
| GET | `/api/transactions/:id` | owner_admin, kasir | Read one transaction detail. |
| POST | `/api/returns` | customer: owner_admin/kasir; supplier: owner_admin | Create an atomic return. Customer UI is complete; Supplier UI is deferred. |
| POST | `/api/stock-opname` | owner_admin | Start and freeze an opname session. |
| POST | `/api/stock-opname/:id/apply` | owner_admin | Apply an eligible opname and release its freeze. |
| POST | `/api/stock-opname/:id/cancel` | owner_admin | Cancel an opname without adjustment and release its freeze. |

`staf` is authenticated but cannot use these operational routes. The protected receipt UI is `/transactions/:id/receipt`; it is a server-rendered, read-only route, not an API endpoint.

### Checkout request

```json
{
  "items": [{ "product_unit_id": "uuid", "quantity": 2 }],
  "payment_method": "cash",
  "cash_received": 50000,
  "prescription": { "prescription_number": "RX-001", "doctor_name": "dr. Andi", "patient_name": "Budi", "photo_url": "https://…" }
}
```

For QRIS, omit `cash_received`. The Route Handler resolves the active employee and their open drawer; PostgreSQL calculates prices, tax, invoice number, cash change, FEFO allocations, financial totals, and transaction-time label snapshots.

### Checkout response

```json
{ "ok": true, "data": { "transactionId": "uuid", "invoiceNumber": "INV-20260814-0007", "status": "completed", "subtotal": 45000, "taxAmount": 4950, "totalAmount": 49950, "cashChange": 50, "cashReceived": 50000 } }
```

The response intentionally does not expose client-controlled allocations or snapshots. Cash completes immediately. QRIS creates `pending_payment`, deducts stock, and becomes `completed` only when a cashier verifies the external payment and calls confirm-payment. The current route includes `cashReceived: 0` in its QRIS response envelope even though QRIS accepts no cash tender; this is not a payment authority. Pending QRIS is not paid/final and may be voided; confirmed QRIS must be reversed through customer return/refund.

### Cash drawer terminology

The cashier-facing concept is **Sesi Kasir**; the technical/database term is **cash drawer session**:

```text
start session -> starting cash -> cashier transactions -> close session -> expected vs actual cash
```

Expected physical cash is `opening cash + completed cash sales - cash refunds paid from drawer`. QRIS is excluded.

### POST /api/returns — Customer Return

Customer UI submits `source: "customer"`, `transaction_id`, `refund_method`, `reason`, and `items` containing `transaction_item_id` plus `quantity_in_base`. It does not submit employee identity, drawer identity, refund total, batch/allocation data, snapshots, or cumulative quantities. For cash, the server resolves the authenticated employee's open drawer and passes that trusted value internally; QRIS uses no physical drawer. Final refund, lifecycle, cumulative quantity, batch restoration, and freeze checks remain PostgreSQL authority. Relevant safe failures include `INVALID_TRANSACTION_STATE`, `RETURN_QUANTITY_EXCEEDED`, `NO_ACTIVE_CASH_DRAWER`, and `STOCK_OPNAME_IN_PROGRESS`. Customer Return UI is complete; Supplier Return UI is deferred.

## Product-master import rules

The import UI maps uploaded category, subcategory, supplier, and storage text to existing master records on the server. It never creates master data. Every committed row creates only a product and its base selling unit; no batch, stock quantity, or expiry data is created. Duplicate SKU/barcode values are detected in-file and preflighted against current records; the RPC remains the concurrency-safe authority. Row-level partial success is explicit, and transaction history remains protected by transaction-time snapshots.

## Planned / not implemented API

The following documented scope is not an implemented HTTP contract: category/supplier/master-data CRUD, drawer history, receipt API payload, prescription or QRIS-image upload, return list/detail, stock-opname count entry/session reads, stock-card/expiry/low-stock endpoints, reporting, employee/settings endpoints, and payment-provider callbacks/webhooks. Transaction history is server-rendered rather than a duplicate list API.

An app-hosted static QRIS image is optional future display UX only. Pilot 1 uses an external/physical QRIS displayed at the counter; it has no dynamic QRIS, gateway, webhook, or polling integration.

## Operational rules

- Critical stock and financial mutations run in PostgreSQL RPCs; browser clients cannot call protected RPCs or mutate operational tables directly.
- Checkout has no idempotency key. Do not automatically retry an uncertain submission.
- Stock-opname backend supports start, freeze, apply, and cancel. Full counting/admin UI is still planned.
- Customer Return UI is complete. Supplier Return Backend exists; Supplier Return UI remains deferred.
