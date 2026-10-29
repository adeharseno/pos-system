create function public.dashboard_low_stock(p_business_date date) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  with available as (
    select b.product_id, sum(b.quantity)::bigint as quantity
    from public.product_batches b
    where b.quantity>0 and b.expired_date>=p_business_date
    group by b.product_id
  ), problem as (
    select p.id,p.name,p.base_unit,p.minimum_stock,coalesce(a.quantity,0) as available_stock,
      case when coalesce(a.quantity,0)=0 then 'out' else 'low' end as stock_status
    from public.products p left join available a on a.product_id=p.id
    where p.is_active and (coalesce(a.quantity,0)=0 or (coalesce(a.quantity,0)>0 and coalesce(a.quantity,0)<p.minimum_stock))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'baseUnit',base_unit,'availableStock',available_stock::text,
    'minimumStock',minimum_stock,'status',stock_status)
    order by case stock_status when 'out' then 0 else 1 end,available_stock,name,id),'[]'::jsonb)
  from problem;
$$;
revoke all on function public.dashboard_low_stock(date) from public,anon,authenticated;
grant execute on function public.dashboard_low_stock(date) to service_role;
