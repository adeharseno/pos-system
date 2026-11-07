# Step 7C.4 — Local Database Cleanup

**Date:** 7 November 2026  
**Scope:** local development database only  
**Production touched:** no  
**Excel imported:** no  
**Schema/migrations/RPCs/application code changed:** no

## 1. Connection verification

Verified local before any deletion:

- Supabase CLI reported `DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Direct query confirmed `current_database()=postgres`, server address `172.19.0.2/32` on local Docker port `5432`
- Local Docker services include `supabase_kong_pos-system`, `supabase_rest_pos-system`, etc.
- `.env.local` points to `http://127.0.0.1:54321`
- A remote project ref exists in `supabase/.temp`, but no remote command was used. All SQL in this task ran against `127.0.0.1:54322`.

## 2. Backups

Backup directory:

`/private/var/folders/br/n42vyhhs1cvblnws8dstlgnh0000gn/T/opencode/pos-system-backups`

| File | Purpose | Size |
|---|---|---:|
| `pos-system-public-auth-20261107-143140.sql` | **Verified** logical backup of `public` + `auth` | 408 KB |
| `pos-system-public-auth-20261107-143140.sql.sha256` | Checksum | — |
| `pos-system-local-20261107-141325.dump` | Additional full-database custom-format dump | 719 KB |
| `pos-system-local-20261107-141325.dump.list` | `pg_restore --list` manifest | 92 KB |
| `pos-system-local-20261107-141325.dump.sha256` | Checksum | — |

Verified checksum for the restored backup:

```text
c5e2baa5546f56061bbe90efb7a424564fcfdb17f2814c8af8bb91cb4daae233
```

Verification was done by restoring the `public`+`auth` SQL backup into a disposable scratch database and checking:

```text
employees=3, products=22, transactions=5, user_profiles=2, auth_users=2, categories=7
```

The scratch database was dropped after verification.

## 3. Cleanup method

Cleanup ran in a **single transaction** with `ON_ERROR_STOP=1`. It used explicit `DELETE` statements in dependency order. No `TRUNCATE CASCADE` was used.

Preserved:

- Supabase `auth.users` and the auth schema.
- `owner@pos.local` auth user.
- `Owner Local` employee (`owner_admin`, active).
- Owner `user_profiles` mapping.
- `permission_definitions` (45).
- `role_permissions` (57, including all 45 owner permissions).
- `employee_access_guard` (1).
- Schema, migrations `0001–0046`, RPCs, functions, triggers, views.

Removed:

- All product, inventory, batch, purchase, transaction, return, opname, expense, and receiving data.
- All categories, subcategories, suppliers, tax rates, storage locations.
- Invoice sequences and business counters.
- Test employees, invitations, permission overrides, login attempts, and audit events.
- Alana’s employee/profile mapping; her Supabase Auth user remains, but she no longer has an employee mapping or application access.

## 4. Row counts before and after

| Table | Before | After |
|---|---:|---:|
| `app_settings` | 0 | 0 |
| `attendances` | 0 | 0 |
| `auth.users` | 2 | 2 |
| `categories` | 7 | 0 |
| `employee_access_guard` | 1 | 1 |
| `employee_invitations` | 1 | 0 |
| `employee_permission_overrides` | 21 | 0 |
| `employees` | 3 | 1 |
| `initial_product_import_requests` | 0 | 0 |
| `invoice_sequences` | 2 | 0 |
| `login_attempts` | 1 | 0 |
| `manual_stock_receiving_events` | 0 | 0 |
| `manual_stock_receiving_requests` | 0 | 0 |
| `operational_expenses` | 0 | 0 |
| `permission_definitions` | 45 | 45 |
| `product_batches` | 23 | 0 |
| `product_units` | 21 | 0 |
| `products` | 22 | 0 |
| `purchase_invoice_items` | 0 | 0 |
| `purchase_invoice_payments` | 1 | 0 |
| `purchase_invoice_receipts` | 0 | 0 |
| `purchase_invoice_requests` | 1 | 0 |
| `purchase_invoices` | 1 | 0 |
| `return_item_batches` | 0 | 0 |
| `return_items` | 0 | 0 |
| `returns` | 0 | 0 |
| `role_permissions` | 57 | 57 |
| `security_audit_events` | 25 | 0 |
| `shifts` | 0 | 0 |
| `stock_opname_items` | 0 | 0 |
| `stock_opname_sessions` | 0 | 0 |
| `storage_locations` | 0 | 0 |
| `subcategories` | 10 | 0 |
| `suppliers` | 1 | 0 |
| `tax_rates` | 3 | 0 |
| `transaction_item_batches` | 6 | 0 |
| `transaction_items` | 5 | 0 |
| `transaction_prescriptions` | 0 | 0 |
| `transactions` | 5 | 0 |
| `user_profiles` | 2 | 1 |

## 5. Authentication verification

Owner login chain after cleanup:

```text
auth.users (owner@pos.local)
  -> public.user_profiles (id = auth user id)
  -> public.employees (username=owner, position=owner_admin, is_active=true)
```

Verified:

- `auth.users` count remains `2`.
- `owner@pos.local` remains.
- Owner profile remains linked to the active `owner_admin` employee.
- `employee_permission_read(owner_auth_id, owner_employee_id)` returned:
  - `is_active: true`
  - `account_enabled: true`
  - 45 definitions
  - all 45 owner preset permissions
  - no overrides
- `role_permissions` for `owner_admin` = 45.
- `employee_access_guard` remains present with revision state.
- Alana’s auth user remains, but her profile/employee mapping was removed.

## 6. Initial import empty-database verification

A synthetic transaction was run and rolled back. No Excel data was imported.

The transaction:

1. Created a temporary category and subcategory.
2. Called `import_initial_products` as the owner.
3. Confirmed it passed the server-side empty-product check and created:
   - `products=1`
   - `product_batches=1`
   - `manual_stock_receiving_events` with `source=initial` = 1
4. Rolled back.

Post-rollback state remains:

```text
products = 0
product_batches = 0
product_units = 0
transactions = 0
manual_stock_receiving_events = 0
initial_product_import_requests = 0
```

## 7. Required reference-data setup before Excel import

These were intentionally cleared and must be recreated locally before the initial Excel import can validate successfully.

### Categories required by `produk_final.xlsx`

- `Obat Bebas`
- `Obat Resep`
- `Racik`
- `Psikotropika`

Optional legacy values that existed before cleanup and may be recreated if desired: `Obat`, `Obat Keras`.

### Subcategories required by `produk_final.xlsx`

- `Alkes`
- `Bebas`
- `Cream`
- `Infus`
- `Injeksi`
- `Obat Tetes`
- `Supp`
- `Syrup`
- `Tablet`

Optional legacy value: `Analgesik`.

### Suppliers

No suppliers remain. Recreate/verify the supplier master from:

`data/legacy/produk_final_supplier_summary.csv`

The Excel has 39 distinct nonblank supplier strings. Only 1 (`ASA MEDIKA` -> `Asa Medika`) matched the old master. Do not auto-create suppliers without administrator verification.

### Units

There is no unit master table. Units are free text on each product and product unit. The Excel uses abbreviations such as `PCS`, `TAB`, `BTL`, `CAP`, `BOX`, `SCT`, `STRIP`, `AMP`, `TUBE`, etc. No unit seed is technically required, but the administrator must confirm whether to keep abbreviations or map them to full names.

### Tax rates

Cleared values were:

- `Tanpa Pajak` — 0%
- `PPN 11%` — 11%
- `PPN 15%` — 15%

The initial importer defaults tax to 0, so tax seeds are not required for the import itself, but they should be recreated if normal taxable sales are needed.

### Other cleared reference data

- `storage_locations`: none existed; optional.
- `invoice_sequences`: cleared; numbering will restart naturally.
- `app_settings`: was empty; optional.
- `employee_permission_overrides`: cleared; owner uses the full owner preset.

## 8. Final state

```text
products = 0
product_batches = 0
product_units = 0
transactions = 0
transaction_items = 0
returns = 0
purchase_invoices = 0
stock_opname_sessions = 0
suppliers = 0
categories = 0
subcategories = 0
tax_rates = 0
storage_locations = 0
employees = 1 (owner_admin)
user_profiles = 1 (owner)
auth.users = 2
permission_definitions = 45
role_permissions = 57
employee_access_guard = 1
```

Schema and migrations `0001–0046` remain intact. No production connection was used. No Excel data was imported.
