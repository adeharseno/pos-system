-- One SQL statement ensures all aggregates use the same MVCC snapshot.
-- Callers must authorize the employee before invoking this service-role RPC.
create function public.sales_gross_profit_report(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with sales as materialized (
    select id, subtotal, tax_amount
    from public.transactions
    where status = 'completed'
      and (
        (payment_method = 'cash' and business_date between p_from and p_to)
        or (payment_method <> 'cash'
          and payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
          and payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta'))
      )
  ), refunds as materialized (
    select id, refund_subtotal, refund_tax_amount
    from public.returns
    where source = 'customer' and business_date between p_from and p_to
  ), sale_totals as (
    select count(*) as transaction_count, coalesce(sum(subtotal), 0) as revenue,
      coalesce(sum(tax_amount), 0) as tax from sales
  ), refund_totals as (
    select coalesce(sum(refund_subtotal), 0) as refund,
      coalesce(sum(refund_tax_amount), 0) as refunded_tax from refunds
  ), sold_cost as (
    select coalesce(sum(b.quantity_in_base * b.cost_price_snapshot), 0) as cogs
    from sales s join public.transaction_items i on i.transaction_id = s.id
    join public.transaction_item_batches b on b.transaction_item_id = i.id
  ), returned_cost as (
    select coalesce(sum(b.quantity_in_base * b.cost_price_snapshot), 0) as cogs
    from refunds r join public.return_items i on i.return_id = r.id
    join public.return_item_batches b on b.return_item_id = i.id
  ), totals as (
    select s.transaction_count, s.revenue, s.tax, r.refund, r.refunded_tax,
      sc.cogs, rc.cogs as returned_cogs, s.revenue - r.refund as net_revenue,
      s.revenue - r.refund - sc.cogs + rc.cogs as gross_profit
    from sale_totals s cross join refund_totals r cross join sold_cost sc cross join returned_cost rc
  )
  select jsonb_build_object(
    'completedTransactionCount', transaction_count,
    'salesRevenue', round(revenue, 2)::text,
    'salesTax', round(tax, 2)::text,
    'refunds', round(refund, 2)::text,
    'refundedTax', round(refunded_tax, 2)::text,
    'netRevenue', round(net_revenue, 2)::text,
    'cogs', round(cogs, 2)::text,
    'returnedCogs', round(returned_cogs, 2)::text,
    'grossProfit', round(gross_profit, 2)::text,
    'grossMarginPercent', case when net_revenue = 0 then null
      else round(gross_profit / net_revenue * 100, 2)::text end
  ) from totals;
$$;

revoke all on function public.sales_gross_profit_report(date, date) from public, anon, authenticated;
grant execute on function public.sales_gross_profit_report(date, date) to service_role;
