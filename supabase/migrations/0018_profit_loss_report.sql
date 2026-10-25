-- Both the existing STABLE sales function and expenses are read within this
-- single STABLE SQL statement, using its shared PostgreSQL MVCC snapshot.
create function public.profit_loss_report(p_from date, p_to date)
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public
as $$
  with sales as materialized (
    select public.sales_gross_profit_report(p_from, p_to) as report
  ), expenses as (
    select coalesce(sum(amount), 0) as total
    from public.operational_expenses
    where expense_date between p_from and p_to
  )
  select jsonb_build_object(
    'salesRevenue', sales.report->>'salesRevenue',
    'refunds', sales.report->>'refunds',
    'netRevenue', sales.report->>'netRevenue',
    'netCogs', round((sales.report->>'cogs')::numeric - (sales.report->>'returnedCogs')::numeric, 2)::text,
    'grossProfit', sales.report->>'grossProfit',
    'grossMarginPercent', sales.report->'grossMarginPercent',
    'operatingExpenses', round(expenses.total, 2)::text,
    'estimatedProfitAfterRecordedExpenses', round((sales.report->>'grossProfit')::numeric - expenses.total, 2)::text
  ) from sales cross join expenses;
$$;

revoke all on function public.profit_loss_report(date, date) from public, anon, authenticated;
grant execute on function public.profit_loss_report(date, date) to service_role;
