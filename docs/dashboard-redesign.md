# Dashboard Pharmacy POS

The UI described below is the initial analytics implementation. The current,
simplified interface is documented in [UI sederhana 60+](ui-sederhana-60-plus.md).
The data sources, calculations and authorization described here remain unchanged.

Implemented on the current branch, continuing the TailAdmin design system.
`/reports` remains unchanged. No new runtime or development dependencies.

## UI

- Four primary metrics: Penjualan Bersih, Jumlah Transaksi, Total Retur,
  and Laba Kotor.
- Four supporting metrics: Total Penjualan (sebelum pajak), HPP Bersih,
  Margin Laba Kotor, and Pajak Bersih.
- Monthly sales bar chart with an independent year selector and explicit
  January–December timeframe.
- Daily area/line chart for the selected date range. Both revenue charts show
  sales before tax and returns, matching the report's `salesRevenue` field.
- Payment-method horizontal bars, including only methods with completed
  transactions. Values include tax, before refunds; labels explain this basis.
- Top five products ranked by net base-unit quantity, with exact net revenue.
- SVG charts support pointer/touch selection, keyboard arrows/Home/End,
  exact amount labels, and expandable data tables. No chart demo package needed.
- Responsive cards, a desktop two-column chart row, full-width daily trends,
  contained chart scrolling on small screens, loading skeletons, empty states,
  and recoverable error states.
- Quick actions and the existing logout action are retained. No monthly targets,
  invented growth percentages, or mock production statistics.

The metric card classes and monthly chart palette, grid, and bar proportions
follow `EcommerceMetrics.tsx` and `MonthlySalesChart.tsx` from the supplied
TailAdmin archive. The existing Phase 1 TailAdmin license notice still applies.

## Data and date rules

Migration `0022_dashboard_analytics.sql` was the next available migration after
checking both repository files and local migration history. It adds one stable,
security-invoker, read-only RPC: `dashboard_analytics_report`.

That RPC composes the existing authoritative `sales_gross_profit_report`,
`payment_refund_report`, and `product_performance_report` functions. It adds
bounded daily/monthly aggregation of completed transaction subtotals, without
changing any existing financial function or write workflow.

Cash sales use `business_date`. QRIS/bank transfers use the confirmation timestamp
converted to Asia/Jakarta. Pending/voided transactions are excluded. Returns,
HPP allocation snapshots, tax, net revenue, profit, and product ranking continue
to come from the existing report functions. HPP Bersih and Pajak Bersih use the
same integer-cent subtraction as `/reports`, performed on the server.

Date presets use Asia/Jakarta and match `/reports`: today, Monday–Sunday, and
the complete calendar month. Custom ranges are inclusive and limited to 366 days
to bound daily-series payloads. Changing the year affects only the monthly chart;
changing the date range updates the summaries, daily chart, payment bars, and
product ranking. A year defaults to the selected period's ending year.

One RPC returns all dashboard financial data from one database snapshot, with
fixed set-based aggregation instead of daily/monthly RPC loops. It returns only
five product rows and at most 366 daily points. The product report itself still
uses its established full-product aggregation. There is no client data fetching.

Layout and dashboard share a React request-scoped memoized wrapper around the
unchanged employee guard. Dashboard context/permission loading is also memoized
within the render, avoiding repeated authentication for individual metrics/charts.
No user identity or report data is cached across requests.

## Permissions

- Only active `owner_admin` sessions with the existing report capabilities can
  reach the financial RPC. A second service boundary checks authorization before
  invoking the read, independently of page rendering.
- Cashier and Staff do not query or receive financial dashboard data, even if
  someone grants them reporting permissions through an override.
- Quick actions intersect effective permissions with the existing destination
  page's role guard. Cashiers can get sales, drawer, catalog and inventory links;
  product creation and receiving remain owner-only.
- Staff currently have no operational feature pages allowed by the existing
  role guards. Their dashboard shows identity, active account status, workplace,
  current Jakarta date and access guidance without broken quick-action links.
- The RPC grants execute only to `service_role`; `anon` and `authenticated`
  cannot call it directly. No new public API endpoint was added.

## Files changed in this continuation

- `src/app/(protected)/dashboard/page.tsx`
- `src/app/(protected)/dashboard/loading.tsx`
- `src/app/(protected)/dashboard/error.tsx`
- `src/app/(protected)/layout.tsx` (uses request-scoped existing guard)
- `src/modules/auth/application/request-employee.ts`
- `src/modules/dashboard/dashboard-model.ts`
- `src/modules/dashboard/dashboard-service.ts`
- `src/modules/dashboard/dashboard-charts.tsx`
- `src/modules/dashboard/dashboard-skeleton.tsx`
- `src/modules/dashboard/dashboard.test.ts`
- `src/types/database.types.ts` (only the generated new RPC signature)
- `supabase/migrations/0022_dashboard_analytics.sql`
- `supabase/tests/database/dashboard_analytics.test.sql`
- `supabase/tests/dashboard-ui.cjs`
- `docs/dashboard-redesign.md`

Pre-existing Phase 1 changes and `next-env.d.ts` were preserved. No changes to
`/reports`, existing migrations, production Supabase, checkout, stock mutation,
returns, or permission/authentication logic. Migration 0022 was applied locally
only with `supabase db push --local`. No push or deployment was performed.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Dashboard/report/auth/permissions unit tests: 27 passed.
- Dashboard/sales/product/payment database suites: 55 pgTAP assertions passed.
  Dashboard fixtures are transactional and rolled back; no demo transactions
  were left in the application database. Checks cover report equality, returned
  batch costs/tax, delayed confirmation, Jakarta boundaries, bank transfer,
  pending/void exclusion, independent year selection, empty results, and grants.
- Authenticated production HTTP checks: all eight displayed metrics matched
  `/reports` for today, this week, this month and a custom date range. Four chart
  sections, invalid-date handling, empty states and login redirect also passed.
- `supabase db lint --local`: no issues in the new RPC. Existing unused-variable/
  parameter warnings remain in `create_product_with_base_unit` and
  `receive_product_stock`.
- Browser visual QA, mobile viewport/touch, keyboard interaction, and live
  Cashier/Staff account walkthroughs were not run: no connected browser or local
  non-owner accounts were available. Role isolation and action filtering were
  verified by unit tests; financial RPC browser grants by database tests.

### Re-run checks

```text
npm run typecheck
npm run lint
npm run build
npx tsx --test src/modules/dashboard/dashboard.test.ts src/modules/reports/sales-report.test.ts src/modules/auth/permissions.test.ts src/modules/auth/auth.test.ts
npx supabase test db --local supabase/tests/database/dashboard_analytics.test.sql supabase/tests/database/sales_gross_profit_report.test.sql supabase/tests/database/product_performance_report.test.sql supabase/tests/database/payment_refund_report.test.sql
```

To run the read-only HTTP comparison against a running local app, provide an
existing local owner's `DASHBOARD_TEST_EMAIL` and `DASHBOARD_TEST_PASSWORD` as
environment variables, optionally set `DASHBOARD_TEST_URL`, then run:

```text
node --env-file=.env.local supabase/tests/dashboard-ui.cjs
```

The script refuses non-local app/Supabase hosts and never logs credentials.
