create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(5,2) not null check (rate >= 0 and rate <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_tax_rates_normalized_name on public.tax_rates (lower(btrim(name)));
create unique index uq_active_tax_rates_rate on public.tax_rates (rate) where is_active;
create trigger trg_tax_rates_updated_at before update on public.tax_rates for each row execute function public.set_updated_at();

insert into public.tax_rates(name,rate,is_active) values
  ('Tanpa Pajak',0,true),('PPN 11%',11,true),('PPN 15%',15,true);

grant select, insert, update on public.tax_rates to service_role;
notify pgrst, 'reload schema';
