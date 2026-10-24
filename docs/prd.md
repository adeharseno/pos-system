# PRD — Pharmacy POS System (Pilot 1)

**PRODUCT REQUIREMENTS DOCUMENT**

**Point of Sale (POS) System for a Pharmacy**

*Pilot 1 — Simple, Low-Cost*

Tech Stack: Next.js · Supabase · Vercel

Version 1.1 | August 14, 2026

*Status: Architecture-Hardened Draft*

---

# 1. Executive Summary

## 1.1 Background

This document defines the product requirements for Pilot 1 of a Point of Sale system built specifically for pharmacy operations. Pilot 1 focuses on validating the core foundation — cashier, pharmaceutical product management (multi-unit, multi-batch, FEFO), and basic reporting — with a technical approach that is simple, low-cost, and fast to build and test in production.

Rather than a separate backend service or microservice architecture, Pilot 1 uses a **modular monolith**: frontend and backend HTTP endpoints live in one Next.js codebase, while Supabase provides PostgreSQL, authentication, and file storage. The application is designed to deploy on Vercel without requiring a custom domain or VPS during development/demo validation. QRIS uses a static image uploaded by the pharmacy owner and manual cashier confirmation — no payment gateway integration. Critical stock-changing workflows execute atomically inside PostgreSQL functions/RPC rather than as several independent API-to-database calls.

This approach is a deliberate choice to validate the concept as quickly and cheaply as possible. Features that add significant complexity but haven't been proven necessary at this stage — approval workflows, payment gateway integration, formal Purchase Orders, offline mode — are deferred to a later pilot, with migration considerations noted in Section 9.

## 1.2 Pilot 1 Goals

- Validate that the cashier system works for pharmacy operations with the core pharmaceutical complexities: multi-unit (box/strip/tablet), multi-batch with FEFO, and drug classification with prescription requirements.

- Validate that the low-cost modular-monolith architecture (Next.js + Supabase + Vercel) is technically sufficient for the Pilot 1 workload without introducing unnecessary infrastructure.

- Provide basic visibility into stock, sales, and finances without the complexity of approval workflows or third-party integrations.

- Gather real feedback from daily use before investing in additional complexity (payment gateway, multi-branch, payroll, CRM) in a later phase.

## 1.3 Pilot 1 Scope

Pilot 1 covers three feature modules:

- **Cashier (Point of Sale)** — multi-unit, prescription validation, automatic FEFO, cash & external/physical static QRIS payment (manual confirmation), browser receipt printing, and simple transaction void.

- **Product & Stock Management** — hierarchical categories, multi-batch tracking, shelf storage locations, simple stock opname, and per-batch returns.

- **Reporting & Finance** — periodic sales reports, profit & loss, and tax (VAT) calculation.

Plus basic operational capabilities: simple employee management and two access roles (Owner/Admin and Cashier).

## 1.4 Out of Scope for Pilot 1

The following are intentionally excluded from Pilot 1, including their schemas — not just their implementation — because they add complexity that hasn't been proven necessary at this validation stage:

- **Payment gateway integration** (Midtrans or otherwise) — QRIS in Pilot 1 is the pharmacy's external/physical static counter QRIS and is manually confirmed by the cashier. See Section 9 for future migration considerations.

- **Approval workflows** for void, returns, and stock opname — in Pilot 1, these actions are recorded with a reason and actor, without a formal submit-review-decide mechanism.

- **Purchase Order to Goods Receipt** — including the schema. Stock input remains entirely manual.

- **Offline mode** — the app assumes a constant internet connection, consistent with the serverless architecture.

- **Granular per-action RBAC** — simplified to two fixed roles: Owner/Admin and Cashier.

- **Payroll and Loyalty/CRM** — these modules are independent and don't affect validation of the core foundation.

- **Multi-branch and online sales channels** — including the `available_online`/`available_offline` flags that were planned previously; excluded to keep the schema simple.

> Schemas for the above are intentionally NOT prepared in Pilot 1. Designing a schema too early for uncertain requirements risks building the wrong structure. It's more efficient to design these when the requirements and context are clear in a later phase.

---

# 2. Tech Stack & Architecture

## 2.1 Technology Components

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | Next.js (React) | Cashier UI, admin dashboard, reports |
| Backend / HTTP boundary | Next.js Route Handlers | Authentication, authorization, request validation, and domain-service orchestration in the same codebase as the frontend |
| Database | PostgreSQL (Supabase) | Managed relational database, constraints, reporting queries, and atomic RPC/functions for critical stock & finance mutations |
| Auth | Supabase Auth | Cashier/admin login, long-lived sessions with automatic token refresh |
| File Storage | Supabase Storage | Prescription photos and product images |
| Hosting | Vercel | Single Next.js deployment; `*.vercel.app` is sufficient during development/demo so a custom domain is not required |
| Receipt Printing | Browser print dialog | Native thermal (ESC/POS/WebUSB/local service) integration is future scope |
| Barcode Scanner | Future USB/Bluetooth HID workflow | Planned; no barcode lookup/scanner flow is implemented in Pilot 1 current scope |

## 2.2 Key Architecture Decisions

### 2.2.1 Modular Monolith: Next.js Full-Stack on Vercel

Pilot 1 is a **modular monolith**, not a microservice system. There is one Next.js application, one deployment, and one PostgreSQL database. Business domains (catalog, inventory, sales, returns, cash drawer, reporting, employees) are kept as explicit code modules so the application remains maintainable without paying the complexity cost of distributed services.

- No separate application server or microservice deployment is required.
- Next.js Route Handlers are the HTTP boundary; they authenticate, authorize, validate input, and call domain services.
- Long/critical stock algorithms are not implemented as a chain of independent Supabase HTTP calls. Atomic workflows are delegated to PostgreSQL functions/RPC.
- A `*.vercel.app` URL is acceptable for development/demo Pilot 1, so purchasing a domain is not required.

> Hosting quotas and commercial-use terms can change. Before live commercial pharmacy operation, re-check the current Vercel/Supabase plan limits and terms. A hosting-plan change should not require an architecture rewrite.

### 2.2.2 Supabase as Database, Auth, and Storage

- **Database**: managed PostgreSQL. Normal reads/CRUD are orchestrated from server-side domain services. Checkout, void, returns, QRIS state transitions, and stock-opname apply use PostgreSQL functions/RPC so locking and writes occur inside one ACID transaction.
- **Auth**: Supabase Auth handles login for Owner/Admin and Cashier.
- **Storage**: used for prescription photos and product images. An optional app-hosted QRIS display asset is future UX, not a Pilot 1 requirement.

> The browser must never receive the Supabase `service_role` key. Transactional tables are not queried directly from client components. Server-side privileged database access occurs only after the incoming request has been authenticated and authorized.

### 2.2.3 Static QRIS with Manual Confirmation

Unlike dynamic QRIS via a payment gateway, Pilot 1 uses the pharmacy's existing external/physical static QRIS at the counter:

- The QRIS is managed outside this application; no upload or app-hosted image is required.
- When QRIS checkout is submitted, the atomic checkout transaction allocates/deducts stock and creates the sale as `pending_payment`. The customer scans the counter QRIS, and the cashier verifies payment externally before confirming it in POS.
- Since there's no automatic integration with the QRIS provider, the cashier must manually confirm payment (e.g. after seeing a payment notification in the QRIS merchant app) by pressing "Confirm Payment Received". Only then does the transaction transition from `pending_payment` to `completed`.

> This shifts payment verification responsibility from the system to the cashier manually. Risk: a cashier can complete a transaction before payment is actually received (by mistake or fraud). Mitigation: record confirmation time on every QRIS transaction for audit purposes, and perform periodic reconciliation between QRIS transaction records in the system and actual merchant account transactions. Pilot 2 can replace this with dynamic QRIS via a payment gateway for automatic confirmation — see Section 9.

### 2.2.4 Database-Side Atomic Transactions

Supabase client calls such as separate `.select()`, `.update()`, and `.insert()` requests do not form one shared database transaction. Therefore, workflows that require row locks and all-or-nothing behavior are implemented as PostgreSQL functions invoked through Supabase RPC.

Critical RPC boundaries include checkout/FEFO allocation, QRIS confirmation, void, customer/supplier returns, and stock-opname apply. This keeps the single-database consistency advantage of the modular monolith.

### 2.2.5 Batch-Based Stock Management and FEFO

Stock is not stored as a single number per product, but as a set of batches (lots) each with their own expiry date. When a sale occurs, the system automatically draws stock from the batch with the nearest expiry date first (FEFO — First Expired First Out), without requiring manual batch selection by the cashier except in special cases. This was retained from the earlier design because it is a core pharmacy requirement that cannot be simplified without undermining the product's core value.

---

# 3. Database Schema Overview

This section describes the core entities and their relationships conceptually for Pilot 1. Compared to the earlier design, the schema is intentionally simplified — tables only relevant to features outside Pilot 1's scope (see Section 1.4) are excluded, keeping the database lean and easy to manage during early validation. Detailed schema (data types, indexes, constraints) is in the separate technical design docs.

## 3.1 Core Entity: Products

### 3.1.1 products table

Stores the base definition of each product. Unit details, per-unit prices, and per-batch stock are in separate tables so a single product can have many sellable units and many batches without data duplication.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Primary key |
| sku | String | Internal product code, unique |
| name | String | Product name |
| generic_name | String | Generic drug name (e.g. "Paracetamol") |
| description | Text | Product description (optional) |
| manufacturer | String | Manufacturer (optional) |
| image_url | String | Product photo URL in Supabase Storage (optional) |
| category_id | UUID (FK) | Category reference |
| subcategory_id | UUID (FK) | Subcategory reference |
| drug_classification | Enum | `otc` / `otc_limited` / `prescription_required` |
| requires_prescription | Boolean | Derived from drug_classification |
| base_unit | String | Base stock unit, e.g. "tablet" |
| cost_price | Decimal | Reference cost price per base unit |
| tax_rate | Decimal | Applicable tax (VAT) percentage |
| is_taxable | Boolean | Whether the product is taxable |
| storage_location_id | UUID (FK) | Shelf location reference |
| minimum_stock | Integer | Minimum stock threshold for restock alerts |
| default_supplier_id | UUID (FK) | Primary supplier reference |
| is_active | Boolean | Active/discontinued status |
| created_at / updated_at | Timestamp | Audit trail |

> `outlet_id`, `available_online`, and `available_offline` from the earlier design are excluded — only relevant for multi-branch and online channel features, which are out of scope (Section 1.4).

### 3.1.2 product_units table (multi-unit per product)

Stores all sellable unit levels for a product (e.g. Box, Strip, Tablet), each with its own price and barcode.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Primary key |
| product_id | UUID (FK) | Product reference |
| unit_name | String | e.g. "Box", "Strip", "Tablet" |
| conversion_to_base | Integer | Number of base units in 1 of this unit (e.g. 1 box = 50 tablets) |
| selling_price | Decimal | Selling price for this specific unit |
| barcode | String | Barcode for this unit (box and strip typically differ) |
| is_base_unit | Boolean | Marks the base unit |

### 3.1.3 product_batches table (multi-batch & expiry)

Stores each incoming stock batch/lot with its expiry date and cost price — the basis for FEFO calculation and actual stock.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Primary key |
| product_id | UUID (FK) | Product reference |
| batch_number | String | Lot/batch number from supplier |
| expired_date | Date | Expiry date |
| quantity | Integer | Remaining stock in this batch, in base units |
| cost_price | Decimal | Cost price for this batch (can differ per delivery) |
| received_date | Date | Date stock was received |

## 3.2 Storage Location Entity

Shelf locations are hierarchical (Zone → Rack → Level) for easy physical product lookup. Each product has one primary location.

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Primary key |
| zone_code | String | e.g. "OTC", "Prescription", "Medical Devices" |
| rack_code | String | e.g. "A3" |
| level_code | String | e.g. "2" |
| full_code | String | Combined, e.g. "OTC-A3-2" |

## 3.3 Categories, Subcategories & Suppliers

### 3.3.1 categories table

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Primary key |
| name | String | Category name, e.g. "Medicine", "Vitamins & Supplements" |
| description | Text | Category description (optional) |
| display_order | Integer | Display order in UI |
| is_active | Boolean | Active status |

### 3.3.2 subcategories table

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Primary key |
| category_id | UUID (FK) | Parent category reference |
| name | String | Subcategory name, e.g. "Analgesics", "Antibiotics" |
| display_order | Integer | Display order in UI |
| is_active | Boolean | Active status |

### 3.3.3 suppliers table

| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | Primary key |
| name | String | Supplier/distributor name |
| contact_person | String | Person in charge |
| phone | String | Phone number |
| address | Text | Address (optional) |
| license_number | String | Pharmaceutical distributor license number |
| is_active | Boolean | Active status |

> `npwp` and `payment_terms` fields from the earlier design are dropped — they're only useful for formal PO workflows, which are out of scope. Add them back when Purchase Orders are implemented in a later phase.

## 3.4 Transaction Entities

| Table | Notes |
| --- | --- |
| transactions | Sale transaction header: DB-generated invoice number, business date, cashier/drawer, totals, payment method, lifecycle status, QRIS confirmation, void audit |
| transaction_items | Customer-facing cart/receipt lines: product, selected unit, unit/base quantity, price/tax snapshots |
| transaction_item_batches | FEFO allocation rows: one transaction item can draw stock from one or more source batches with cost snapshots |
| transaction_prescriptions | Prescription data linked to a transaction: prescription number, doctor name, patient name, prescription photo |
| returns | Customer/supplier return header with actor/reason and customer refund snapshots |
| return_items | Return lines, referencing original transaction item for customer returns |
| return_item_batches | Exact batches restored/deducted by each return line, including cost snapshots |

> The separate `payments` table from the earlier design (which held payment gateway references) is removed — payment status and method are now columns directly on `transactions`, since there are no external gateway references to store in Pilot 1.

## 3.5 Operational Entities

| Table | Notes |
| --- | --- |
| employees | Employee data: identity, position, join date |
| shifts | Employee shift schedule and records |
| attendances | Attendance: check-in/out, linked to shifts |
| cash_drawer_sessions | Cashier shift cash open/close sessions, including variance reconciliation |
| stock_opname_sessions | Stock opname sessions: date, physical vs system variance list, and applied adjustments |

> User roles (Owner/Admin and Cashier) are managed through Supabase Auth (user metadata), not a separate `roles`/`permissions` table as in the earlier granular RBAC design — per the decision to simplify to two fixed roles (Section 7.3).

---

# 4. Feature 1: Cashier (Point of Sale)

## 4.1 Goal

Provide a fast and accurate cashier interface for processing sales transactions, including pharmacy-specific validation (prescription classification, FEFO) with simple payment mechanisms that don't depend on third-party integrations.

## 4.2 Functional Requirements

### 4.2.1 Barcode Scanning

- The implemented cashier search is by product name or SKU.
- Barcode lookup/scanner workflow is planned production backlog; product-unit barcode fields do not mean a lookup UI currently exists.

### 4.2.2 Sell Unit Selection

- When a product is added to the cart, the cashier can select the sell unit (Box/Strip/Tablet) if the product has more than one.
- Price automatically adjusts based on the selected unit, from `product_units` data.
- The system converts the sold quantity to base units for stock deduction.

### 4.2.3 Prescription Classification Validation

- If a cart item has `drug_classification = prescription_required`, the system holds the checkout and shows a required prescription form (prescription number, doctor name, patient name).
- The form supports optional prescription photo upload (stored in Supabase Storage).
- Items classified as `otc` or `otc_limited` can be processed without additional friction.

### 4.2.4 Automatic Stock Allocation (FEFO)

- At checkout, the system automatically selects the batch with the nearest `expired_date` first (FEFO) to fulfill the sold quantity.
- If one batch has insufficient stock, the system automatically splits the allocation across multiple batches.
- The system records each FEFO source batch in `transaction_item_batches`. One customer-facing `transaction_items` row may have multiple batch allocations.
- Expired products (`expired_date` has passed) cannot be sold; the system blocks the sale and shows a warning to the cashier.

### 4.2.5 Payment Methods

| Method | Mechanism |
| --- | --- |
| Cash | Cashier enters amount received, system calculates change automatically |
| QRIS (manual) | Customer scans the pharmacy's external/physical counter QRIS. Cashier manually presses "Confirm Payment Received" after verifying payment externally (for example in the merchant app). |

- Bank transfer and automatic e-wallets are not included in Pilot 1 — see Section 1.4 and Section 9 for plans to add more payment methods in a later phase.
- QRIS transactions record the confirmation time (`payment_confirmed_at`) and confirming cashier. Pending QRIS transactions are excluded from completed-sales revenue and can be voided to release stock if payment is abandoned.

### 4.2.6 Receipt Printing

- A receipt can be opened after a successful transaction and printed through the browser print dialog, showing stored item labels, unit, price, tax, and payment method. Native thermal printing is future scope.
- Receipt reprint from transaction history is planned for M2.8; the current receipt route is available immediately after checkout.

### 4.2.7 Void & Cancel Transaction

- The cashier can void a saved transaction by entering a cancellation reason.
- Voiding a transaction automatically restores stock using the original `transaction_item_batches` allocations. A transaction with an existing customer return cannot be voided in Pilot 1, preventing double stock restoration.
- Every void is recorded clearly: who did it, when, and why — but with no approval workflow. Owner/Admin can review the full void history at any time via reports, as a passive post-transaction audit rather than a prerequisite for the void itself.

> This simplification fits Pilot 1's scale assumptions: a single outlet with few cashiers, where the Owner/Admin is likely also directly overseeing daily operations. Approval workflows can be reconsidered in a later phase if the business grows (more cashiers, owner not directly supervising day-to-day).

### 4.2.8 Cash Drawer (Shift Cash Management)

- The cashier opens a cash session at the start of a shift by recording the opening balance (physical cash).
- At the end of the shift, the cashier closes the session by counting physical cash; the system compares it to the expected amount (opening balance + cash sales) and records any variance.
- Session history can be reviewed by Owner/Admin.

## 4.3 Happy Path Flow

1. Cashier logs in via Supabase Auth and opens a cash drawer session at the start of shift.
2. Cashier searches a product by name or SKU.
3. System shows the product and available units; cashier selects the sell unit.
4. If the product requires a prescription, the system requests prescription data before the item can be added to the cart.
5. Cashier repeats steps 2–4 for all items.
6. Cashier selects payment method (Cash or QRIS) and submits checkout.
7. The checkout database RPC validates the cashier's open drawer, locks eligible batches, performs FEFO allocation, deducts stock, generates the invoice number, and records the transaction atomically. Cash becomes `completed`; QRIS becomes `pending_payment`.
8. For QRIS, the customer scans the external counter QRIS; after verifying payment in the merchant app, the cashier confirms the payment and the transaction transitions to `completed`.
9. The receipt can be printed for the completed transaction.
10. Cashier closes the cash drawer session at the end of shift with reconciliation.

## 4.4 Core Business Rules

- A transaction cannot be completed if any item requires a prescription and no prescription data has been entered.
- A transaction cannot be completed if available stock (across all active batches) is insufficient for the requested quantity.
- QRIS checkout is created as `pending_payment`; it becomes `completed` only after manual cashier confirmation. Pending QRIS transactions do not count as completed sales revenue.
- Products where all batches have expired cannot be sold.
- Checkout requires an open cash drawer session owned by the authenticated cashier.
- Sales, voids, returns, and stock-opname apply must be atomic database transactions.

---

# 5. Feature 2: Product & Stock Management

## 5.1 Goal

Provide control over product data, categories, suppliers, and stock — including pharmacy-specific complexity like multi-unit, multi-batch, storage locations, and FEFO compliance — with a lean process requiring no approval workflows.

## 5.2 Dashboard

- Shows a summary of total transactions and sales value with filters: Today, This Month, This Year, and All Time.
- Shows critical stock indicators (products below `minimum_stock`) and near-expiry products.

## 5.3 Category Management

- CRUD for categories (level 1) and subcategories (level 2) — two-level hierarchical structure.
- Every product must be linked to one category and one subcategory.

## 5.4 Product CRUD

- Product input/edit form covers all base fields (see Section 3.1.1), including drug classification, base unit, and shelf location.
- Multi-unit management (`product_units`) is in the same form — admin can add new units with their own price and barcode.
- Validation: at least one unit must be marked `is_base_unit`.
- Product search and filter by category, drug classification, stock status, and shelf location.

## 5.5 Supplier CRUD

- Supplier input/edit form covers the fields in Section 3.3.3, including the pharmaceutical distributor license number.

## 5.6 Storage Locations

- Manage the Zone → Rack → Level hierarchical structure as its own master data.
- Each product is linked to one primary storage location, used for quick physical product lookup by staff.

## 5.7 Stock & Batch Management

### 5.7.1 Manual Stock/Batch Input

- Stock additions are done via manual input: admin/staff enter product, quantity, batch number, expiry date, cost price, and received date.
- Each manual stock input creates a new `product_batches` entry, unless the batch number and expiry date are identical to an existing entry (in which case the quantity is added to the existing row).

### 5.7.2 Per-Batch Stock Card

- The stock card is derived from transaction history, returns, and opname adjustments linked to each batch.
- Stock card reports can be viewed per product or per specific batch.

### 5.7.3 Expiry Alerts

- The system shows notifications for batches expiring within a configurable time window (e.g. 30/60/90 days ahead).
- Batches past their expiry date are automatically excluded from the sales process.

## 5.8 Stock Opname

- Admin can create a new stock opname session, with products filterable by shelf location.
- Pilot 1 snapshots and counts stock **per batch**. The UI may group batches by product for convenience, but adjustments must remain batch-specific for traceability.
- `physical_quantity` remains empty until the batch is counted. The session cannot be applied while any row is uncounted.
- Pilot 1 uses an **operational freeze** for batches included in an `in_progress` stock-opname session. Checkout, void, returns, and manual stock changes that would touch a frozen batch are rejected until the session is applied or cancelled.
- Only one `in_progress` stock-opname session is allowed globally in Pilot 1.
- The system computes each batch variance and applies all counted quantities atomically with a note/reason — no additional approval needed. Setting live stock directly to the counted quantity is safe because the affected batches remain frozen from snapshot through apply.
- An opname can be cancelled before apply; cancellation changes no stock and releases the freeze.
- Physical stock with no known batch must first be entered through manual batch stock entry rather than assigned silently to an arbitrary existing batch.
- Full history of all opname sessions and adjustments is stored for Owner/Admin review at any time.

## 5.9 Returns

- Returns can be initiated from transaction history (customer returns) or independently (supplier returns for expired/defective products).
- Customer returns reference the original `transaction_item_id` and restore stock only to batches used by that item's original FEFO allocations.
- Cumulative partial returns may never exceed the originally sold quantity.
- Customer returns snapshot refund values and returned COGS so net sales and P&L remain historically correct. The operator records whether the refund was paid via Cash or QRIS/manual non-cash. A cash refund is linked to the currently-open drawer that physically pays the refund, not the drawer from the original sale.
- Every return is recorded with a reason and processor and is applied atomically to stock — no approval workflow.
- Supplier returns deduct stock from the selected batch and do not reduce customer sales revenue.

---

# 6. Feature 3: Reporting & Finance

## 6.1 Goal

Give the pharmacy owner/admin basic financial visibility, accounting for the complexity of per-batch cost prices and per-unit selling prices.

## 6.2 Sales Report

- Sales summary with period filters: daily, weekly, monthly, and yearly.
- Available as a summary (total revenue, transaction count, average transaction value) or itemized per product/category.
- Additional filters: by cashier and payment method (Cash/QRIS).

## 6.3 Profit & Loss Report

- Computes net profit using net sales and net COGS: `(completed sales − customer refunds) − (sale COGS − returned COGS) − operational expenses`.
- Sale COGS is based on `transaction_item_batches.cost_price_snapshot`; returned COGS is reversed from `return_item_batches.cost_price_snapshot`, not from current product cost or a moving average.
- Operational expenses (salary, rent, electricity, etc.) can be entered as manual entries per period by Owner/Admin.

## 6.4 Tax Calculation (VAT)

- Each product has its own `is_taxable` flag and `tax_rate`.
- The system calculates VAT automatically on each transaction, shown separately on the receipt and in reports.

## 6.5 Stock Reports (Finance Support)

- Current stock value report (based on `cost_price` of each batch still in stock).
- Per-product/batch stock card report as described in Section 5.7.2.

---

# 7. Operations

## 7.1 Goal

Support basic access management and employee operations for the pharmacy, with a simple role structure appropriate for Pilot 1's scale.

## 7.2 Employee Management

- CRUD for employee data: identity, position, and join date.
- Attendance recording (check-in/check-out) linked to shift sessions and the cash drawer (Section 4.2.8) for cashiers.
- Shift scheduling per employee.

## 7.3 Access Roles (Two Roles)

Pilot 1 uses two fixed roles, managed through Supabase Auth, without a granular per-module/per-action permission matrix:

| Role | Access |
| --- | --- |
| Owner/Admin | Current access includes protected operational workflows; master-data management, reports, employee management, and optional QRIS display settings remain planned where no UI/API is implemented. |
| Cashier | Access to the cashier module (transactions, cash drawer) and read-only access to product data for search during transactions |

- All significant actions (transactions, void, returns, stock adjustments) record the actor's identity (logged-in cashier/admin), regardless of the absence of an approval mechanism — so history remains traceable by Owner/Admin.

> If additional roles are needed later (e.g. a Pharmacist with specific prescription validation authority, or a Supervisor separate from the Owner), the two-role structure can be extended without changing the Supabase Auth foundation already in place — see Section 9 for later-phase considerations.

---

# 8. Non-Functional Requirements

## 8.1 Performance

- If the planned barcode workflow is added, barcode scan to product appearing in the cart should be under 1 second.
- If optional app-hosted QRIS display UX is added later, it should appear promptly; it is not a Pilot 1 blocker.
- API requests must remain short-running and compatible with the limits of the currently selected Vercel plan; potentially slow reports use database-side aggregation and pagination. Hosting limits must be re-checked before deployment because provider quotas can change.

## 8.2 Reliability & Data Integrity

- All operations that affect stock (checkout, void, returns, opname adjustments) must be atomic database transactions. Critical workflows run inside PostgreSQL functions/RPC and use row locking where required.
- Privileged database access occurs server-side only after session and role verification. The browser never receives the service-role key.
- Invoice generation must be concurrency-safe and occur inside the checkout transaction.
- Database composite foreign keys must prevent cross-product unit/batch references in transaction, return, and opname rows.
- Database check constraints must reject invalid payment lifecycle combinations (for example cash + `pending_payment`, QRIS pending with confirmation metadata, or voided rows without void metadata).
- Stock-changing RPCs must re-check active stock-opname freezes after acquiring their target batch locks so a concurrent opname start cannot be bypassed.
- Operational business-day calculations use `Asia/Jakarta` while persisted timestamps remain UTC.

## 8.3 Security

- All communication over HTTPS (default on Vercel).
- User authentication via Supabase Auth with automatic token refresh.
- Prescription photos and patient data stored in Supabase Storage with role-based access restrictions (Owner/Admin and Cashier).

## 8.4 Auditability

- All significant actions (transactions, void, returns, stock adjustments, QRIS payment confirmation) record the time and actor, even without a multi-level approval mechanism.

## 8.5 Operational Cost

- Development/demo Pilot 1 targets zero purchased infrastructure: Vercel-hosted Next.js, Supabase, and a `*.vercel.app` URL, with no VPS or custom domain required.
- Free-tier quotas and hosting/commercial-use terms are external constraints and may change. They must be verified before live commercial use. If a plan/host change becomes necessary, the modular-monolith architecture should remain portable without redesigning the application domains or database model.

---

# 9. Roadmap & Pilot 2 Considerations

## 9.1 Planning Philosophy

Unlike the earlier approach of pre-designing schemas for deferred features, Pilot 1 intentionally keeps the schema as minimal as possible. The reasoning: at the early validation stage, the final form of requirements (e.g. a Purchase Order schema, or multi-branch structure) isn't necessarily what we'd assume today. Designing schemas too early for uncertain requirements risks building structures that need to be reworked rather than used directly.

## 9.2 Pilot 1 Development Stages

| Stage | Focus |
| --- | --- |
| M0 | Architecture/schema hardening: modular-monolith boundaries, transaction/batch allocation, composite FKs, payment lifecycle constraints, refund-drawer attribution, stock-opname freeze, return/void rules, invoice sequencing, timezone |
| M1 | Next.js + Supabase setup, schema/RLS, atomic PostgreSQL RPC/functions, database tests |
| M2 | Auth, master data, product/unit/batch inventory basics |
| M3 | Cashier core: drawer, name/SKU cart, atomic FEFO checkout, cash, browser receipt, void |
| M4 | Future optional QRIS display UX; manual external-counter QRIS is already the Pilot 1 payment model |
| M5 | Customer/supplier returns, batch stock opname, stock card |
| M6 | Reports/finance and employee operations |

## 9.3 Pilot 2 Migration Considerations

Several Pilot 1 decisions need to be specifically revisited when moving to Pilot 2, with trade-offs already identified at this stage:

### 9.3.1 Payment Gateway Integration

- The Next.js + Vercel + Supabase architecture can be used for Pilot 2 with a payment gateway — no migration to a long-running server (Railway/Render/VPS) is needed just to receive webhooks, since Next.js API Routes already work as public endpoints that can receive payment notifications.
- Things to handle at implementation: (1) idempotency on the webhook endpoint, so duplicate notifications from the payment gateway don't cause duplicate transaction records or double stock deductions; (2) ensure the Supabase database connection uses connection pooling mode (Supavisor/PgBouncer, already provided by Supabase), since serverless functions can spin up many instances simultaneously each opening a new connection; (3) design atomic transaction status checking to avoid conflicts between cashier-side polling and webhook notifications arriving nearly simultaneously.
- The `transactions` table needs additional columns (e.g. `payment_gateway_reference_id`) when this feature is implemented; this is an additive change and doesn't require major structural migration from the Pilot 1 schema.

### 9.3.2 Approval Workflows

- If the business scales (more cashiers, ownership not directly supervising daily operations), multi-level approval for void/return/opname as designed in the earlier document can be reconsidered and implemented as an addition to the existing recording structure, without changing the foundation built in Pilot 1.

### 9.3.3 Purchase Order & Goods Receipt

- The PO/GR schema will be designed when this feature is actually being built, using the manual stock input pattern from Pilot 1 as a reference for real field requirements.

### 9.3.4 Multi-Branch and Online Channels

- Since Pilot 1 doesn't include an `outlet_id` column from the start, migrating to multi-branch in a later phase requires adding that column to all transactional and operational tables, along with a data migration from the single-outlet state. This is a known and accepted trade-off in exchange for a simpler schema in Pilot 1.

### 9.3.5 Granular RBAC, Payroll, and CRM

- These modules can be added independently in a later phase without affecting the Pilot 1 foundation, as they have no structural dependencies on the cashier or stock modules.

---

# 10. Open Questions & Assumptions

## 10.1 Decisions Still Needed

- Reconciliation mechanism between QRIS transaction records in the system and actual merchant account/QRIS app transactions — whether done manually by Owner/Admin periodically, or via an additional supporting feature.
- Handling cases where a cashier accidentally presses "Confirm Payment Received" before payment has arrived — whether voiding the transaction manually is sufficient, or a specific correction mechanism is needed.
- Return policy for prescription drugs (pharmacy regulatory/internal policy on returning prescription medications).

## 10.2 Assumptions Used in This Document

- Pilot 1 operates at a single physical location with one or a few cashiers, where Owner/Admin can directly supervise operations, so a multi-level approval mechanism is not yet needed.
- The cashier device has a stable internet connection throughout operations, as the serverless architecture does not support offline mode.
- The pharmacy has an active QRIS merchant account independent of this system; Pilot 1 relies on its external/physical static QRIS with no provider integration.
- Browser printing is the implemented receipt output. ESC/POS compatibility matters only for future native-printer work.
- Prescription management in Pilot 1 is administrative record-keeping (prescription number, doctor, patient), not automatic medical verification.
