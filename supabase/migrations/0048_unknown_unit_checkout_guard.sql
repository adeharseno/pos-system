begin;

-- Category/subcategory may remain unassigned by policy. Only the explicit
-- unknown-unit state prevents sales; the pending classification marker remains
-- available for later master-data review.
create or replace function public.guard_unknown_unit_sale()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists (select 1 from public.products where id=new.product_id and not unit_confirmed) then
    raise exception 'PRODUCT_UNIT_NOT_CONFIRMED';
  end if;
  return new;
end; $$;

commit;
