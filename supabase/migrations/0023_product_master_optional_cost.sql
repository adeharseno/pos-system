-- Unknown cost must remain unknown rather than being recorded as a fictitious zero.
-- Existing values/default and priced create RPC contracts are preserved.
alter table public.products alter column cost_price drop not null;
comment on column public.products.cost_price is 'NULL means cost has not been set for a master product; zero is an explicitly supplied cost.';
