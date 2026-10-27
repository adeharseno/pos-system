-- Dashboard-only read aggregation. Existing report functions remain authoritative.
-- One statement / snapshot; no per-day or per-month RPC calls.
create function public.dashboard_analytics_report(p_from date, p_to date, p_year integer)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public
as $function$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
     or p_year is null or p_year < 1900 or p_year > 9998 then
    raise exception 'INVALID_DASHBOARD_PERIOD' using errcode = '22023';
  end if;
  return (
    with recognized as materialized (
      select case when payment_method = 'cash' then business_date
        else (payment_confirmed_at at time zone 'Asia/Jakarta')::date end as day,
        subtotal
      from public.transactions
      where status = 'completed' and (
        (payment_method = 'cash' and (business_date between p_from and p_to
          or business_date >= make_date(p_year, 1, 1) and business_date < make_date(p_year + 1, 1, 1)))
        or (payment_method <> 'cash' and (
          (payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
           and payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta'))
          or (payment_confirmed_at >= (make_date(p_year, 1, 1)::timestamp at time zone 'Asia/Jakarta')
           and payment_confirmed_at < (make_date(p_year + 1, 1, 1)::timestamp at time zone 'Asia/Jakarta'))))
      )
    ), daily as (
      select day, sum(subtotal) as revenue, count(*) as count from recognized
      where day between p_from and p_to group by day
    ), monthly as (
      select extract(month from day)::integer as month, sum(subtotal) as revenue, count(*) as count
      from recognized where day >= make_date(p_year, 1, 1) and day < make_date(p_year + 1, 1, 1)
      group by extract(month from day)
    )
    select jsonb_build_object(
      'summary', public.sales_gross_profit_report(p_from, p_to),
      'payments', public.payment_refund_report(p_from, p_to)->'methods',
      'products', coalesce((select jsonb_agg(item order by ordinal)
        from jsonb_array_elements(public.product_performance_report(p_from, p_to, 'quantity')->'bestSelling')
          with ordinality as ranking(item, ordinal) where ordinal <= 5), '[]'::jsonb),
      'daily', (select jsonb_agg(jsonb_build_object(
        'date', (p_from + n)::text, 'revenue', round(coalesce(d.revenue, 0), 2)::text,
        'count', coalesce(d.count, 0)) order by n)
        from generate_series(0, p_to - p_from) n left join daily d on d.day = p_from + n),
      'monthly', (select jsonb_agg(jsonb_build_object(
        'date', make_date(p_year, n, 1)::text, 'revenue', round(coalesce(m.revenue, 0), 2)::text,
        'count', coalesce(m.count, 0)) order by n)
        from generate_series(1, 12) n left join monthly m on m.month = n)
    )
  );
end;
$function$;

revoke all on function public.dashboard_analytics_report(date, date, integer) from public, anon, authenticated;
grant execute on function public.dashboard_analytics_report(date, date, integer) to service_role;
