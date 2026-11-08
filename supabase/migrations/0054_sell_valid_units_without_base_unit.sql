begin;

-- A concrete product_units row remains mandatory: it owns the selling price,
-- product relation, and conversion used by atomic checkout. A missing base-unit
-- label alone must not block a valid selling unit. Reject zero-price lines at
-- the transaction boundary so UI/API callers cannot bypass the rule.
create or replace function public.guard_unknown_unit_sale()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.unit_price is null or new.unit_price <= 0 then
    raise exception 'INVALID_SELLING_PRICE';
  end if;
  return new;
end; $$;

commit;
