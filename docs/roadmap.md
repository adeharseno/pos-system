# Implementation Roadmap & Scope Boundaries — Pharmacy POS (Pilot 1)

## 9. Implementation Checklist

| Stage | Work Items |
|---|---|
| 1 | `0001_init.sql` migration (Section 3) + `0002_rls_policies.sql` (Section 4) + seed basic categories/locations |
| 2 | `lib/pos/fefo.ts`, `checkout` endpoint, `void` endpoint, cashier UI + barcode scanner + receipt printing |
| 3 | `qris-upload-url` endpoint, `settings` endpoint, `confirm-payment` endpoint, QRIS modal in cashier UI |
| 4 | `stock-opname/*` endpoints, `returns/*` endpoints, `stock/expiring` endpoint |
| 5 | `reports/*` endpoints, `dashboard/summary` endpoint |
| 6 | `employees`, `shifts`, `attendances`, `cash-drawer/*` endpoints, two-role enforcement in `middleware.ts` |

---

## 10. Intentionally Out of Scope (aligned with PRD Sections 1.4 & 9)

No tables or endpoints for: payment gateway references, approval workflows (submit-review-decide), Purchase Order/Goods Receipt, offline sync queue, granular permission matrix, payroll, loyalty/CRM, `outlet_id`/multi-branch. When these are needed in Pilot 2, refer to the trade-offs documented in PRD Section 9.3 as the starting point for schema design.
