-- A single statement provides one MVCC snapshot for sales, returns and stock.
create function public.product_performance_report(p_from date, p_to date, p_sort text default 'quantity')
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public
as $$
  with sales as (
    select i.product_id, sum(i.quantity_in_base) as quantity, sum(i.subtotal) as revenue
    from public.transactions t join public.transaction_items i on i.transaction_id = t.id
    where t.status = 'completed' and (
      (t.payment_method = 'cash' and t.business_date between p_from and p_to)
      or (t.payment_method <> 'cash'
        and t.payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
        and t.payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta')))
    group by i.product_id
  ), refunds as (
    select i.product_id, sum(i.quantity_in_base) as quantity, sum(i.refund_subtotal) as revenue
    from public.returns r join public.return_items i on i.return_id = r.id
    where r.source = 'customer' and r.business_date between p_from and p_to
    group by i.product_id
  ), stock as (
    select product_id, sum(quantity) as quantity from public.product_batches
    where quantity > 0 and expired_date >= (now() at time zone 'Asia/Jakarta')::date
    group by product_id
  ), performance as (
    select p.id, p.name, p.sku, coalesce(s.quantity, 0) as sold,
      coalesce(r.quantity, 0) as returned, coalesce(s.quantity, 0) - coalesce(r.quantity, 0) as net_quantity,
      coalesce(s.revenue, 0) - coalesce(r.revenue, 0) as net_revenue
    from public.products p left join sales s on s.product_id = p.id
      left join refunds r on r.product_id = p.id
    where s.product_id is not null or r.product_id is not null
  ), unsold as (
    select p.id, p.name, p.sku, p.base_unit, coalesce(st.quantity, 0) as available_stock
    from public.products p left join sales s on s.product_id = p.id
      left join stock st on st.product_id = p.id
    where p.is_active and s.product_id is null
  )
  select jsonb_build_object(
    'bestSelling', coalesce((select jsonb_agg(jsonb_build_object(
      'productId', id, 'name', name, 'sku', sku, 'quantitySold', sold::text,
      'returnedQuantity', returned::text, 'netQuantity', net_quantity::text,
      'netRevenue', round(net_revenue, 2)::text)
      order by case when p_sort = 'revenue' then net_revenue else net_quantity end desc, name, id)
      from performance), '[]'::jsonb),
    'unsold', coalesce((select jsonb_agg(jsonb_build_object(
      'productId', id, 'name', name, 'sku', sku, 'baseUnit', base_unit,
      'availableStock', available_stock::text, 'hasStock', available_stock > 0)
      order by (available_stock > 0) desc, name, id) from unsold), '[]'::jsonb)
  );
$$;

revoke all on function public.product_performance_report(date, date, text) from public, anon, authenticated;
grant execute on function public.product_performance_report(date, date, text) to service_role;
