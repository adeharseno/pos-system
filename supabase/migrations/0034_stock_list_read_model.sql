create or replace function public.stock_list_read_model(
  p_business_date date,
  p_query text default '',
  p_active_status text default 'all',
  p_prescription_status text default 'all',
  p_stock_status text default 'all',
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_offset integer;
  v_result jsonb;
begin
  if p_business_date is null then raise exception 'business date is required' using errcode = '22023'; end if;
  if length(v_query) > 80 then raise exception 'query is too long' using errcode = '22023'; end if;
  if p_active_status not in ('all', 'active', 'inactive') then raise exception 'invalid active status' using errcode = '22023'; end if;
  if p_prescription_status not in ('all', 'required', 'non_prescription') then raise exception 'invalid prescription status' using errcode = '22023'; end if;
  if p_stock_status not in ('all', 'out', 'low', 'normal', 'needs_restock') then raise exception 'invalid stock status' using errcode = '22023'; end if;
  if p_sort not in ('name_asc', 'stock_asc', 'stock_desc', 'expiry_asc') then raise exception 'invalid sort' using errcode = '22023'; end if;
  if p_page < 1 or p_page > 10000 then raise exception 'invalid page' using errcode = '22023'; end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid limit' using errcode = '22023'; end if;
  v_offset := (p_page - 1) * p_limit;

  with candidate_products as (
    select p.* from products p
    where (p_active_status = 'all' or p.is_active = (p_active_status = 'active'))
      and (p_prescription_status = 'all' or p.requires_prescription = (p_prescription_status = 'required'))
      and (v_query = '' or p.name ilike '%' || v_query || '%' or p.sku ilike '%' || v_query || '%'
        or exists (select 1 from product_units pu where pu.product_id = p.id and pu.barcode = v_query))
  ), batch_totals as (
    select pb.product_id, sum(pb.quantity)::integer as available_stock, min(pb.expired_date) as nearest_expiry
    from product_batches pb
    join candidate_products p on p.id = pb.product_id
    where pb.quantity > 0 and pb.expired_date >= p_business_date
    group by pb.product_id
  ), unit_totals as (
    select pu.product_id, count(*)::integer as unit_count,
      max(pu.selling_price) filter (where pu.is_base_unit) as base_selling_price
    from product_units pu
    join candidate_products p on p.id = pu.product_id
    group by pu.product_id
  ), base as (
    select p.id, p.sku, p.name, p.generic_name, p.manufacturer, p.base_unit,
      p.requires_prescription, p.is_active,
      coalesce(c.name, '—') as category,
      coalesce(sc.name, '—') as subcategory,
      s.name as default_supplier,
      sl.full_code as storage_location,
      coalesce(u.unit_count, 0) as unit_count,
      coalesce(b.available_stock, 0) as available_stock,
      p.minimum_stock,
      case
        when coalesce(b.available_stock, 0) = 0 then 'out'
        when coalesce(b.available_stock, 0) <= p.minimum_stock then 'low'
        else 'normal'
      end as stock_status,
      b.nearest_expiry,
      u.base_selling_price
    from candidate_products p
    left join batch_totals b on b.product_id = p.id
    left join unit_totals u on u.product_id = p.id
    left join categories c on c.id = p.category_id
    left join subcategories sc on sc.id = p.subcategory_id
    left join suppliers s on s.id = p.default_supplier_id
    left join storage_locations sl on sl.id = p.storage_location_id
  ), matched as (
    select *
    from base
    where p_stock_status = 'all'
      or stock_status = p_stock_status
      or (p_stock_status = 'needs_restock' and stock_status in ('out', 'low'))
  ), paged as (
    select * from matched
    order by
      case when p_sort = 'stock_asc' then case stock_status when 'out' then 0 when 'low' then 1 else 2 end end,
      case when p_sort = 'stock_asc' then available_stock end asc,
      case when p_sort = 'stock_desc' then available_stock end desc,
      case when p_sort = 'expiry_asc' then nearest_expiry end asc nulls last,
      case when p_sort = 'name_asc' then lower(name) end asc,
      lower(name) asc, id asc
    limit p_limit offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'sku', sku, 'name', name, 'genericName', generic_name,
      'manufacturer', manufacturer, 'baseUnit', base_unit,
      'requiresPrescription', requires_prescription, 'isActive', is_active,
      'category', category, 'subcategory', subcategory,
      'defaultSupplier', default_supplier, 'storageLocation', storage_location,
      'unitCount', unit_count, 'availableStock', available_stock,
      'minimumStock', minimum_stock, 'stockStatus', stock_status,
      'nearestExpiry', nearest_expiry, 'baseSellingPrice', base_selling_price
    ) order by
      case when p_sort = 'stock_asc' then case stock_status when 'out' then 0 when 'low' then 1 else 2 end end,
      case when p_sort = 'stock_asc' then available_stock end asc,
      case when p_sort = 'stock_desc' then available_stock end desc,
      case when p_sort = 'expiry_asc' then nearest_expiry end asc nulls last,
      case when p_sort = 'name_asc' then lower(name) end asc,
      lower(name) asc, id asc) from paged), '[]'::jsonb),
    'total', (select count(*) from matched)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.stock_list_read_model(date,text,text,text,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.stock_list_read_model(date,text,text,text,text,text,integer,integer) to service_role;
comment on function public.stock_list_read_model(date,text,text,text,text,text,integer,integer) is
  'Reusable server-only stock list read model with database-side filtering, sorting, and pagination.';
