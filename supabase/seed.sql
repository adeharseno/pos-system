-- Reference/lookup data only. Safe to run repeatedly.
--
-- Deliberately excluded: products, suppliers, employees, auth users, storage
-- locations, and all transactional rows.
--
-- drug_classification is an enum defined in 0001_init.sql; it has no table rows.
-- product_units is transactional data (units belong to a product), not a lookup.
--
-- The schema already enforces one row per normalized name:
--   categories     uq_categories_normalized_name     lower(btrim(name))
--   subcategories  uq_subcategories_normalized_name  lower(btrim(name))
--   tax_rates      uq_tax_rates_normalized_name      lower(btrim(name))
--                  uq_active_tax_rates_rate          rate where is_active
-- ON CONFLICT DO NOTHING therefore skips an existing equivalent row, even if
-- its casing or surrounding whitespace differs.

insert into public.categories (name, display_order, is_active)
values
  ('OBAT BEBAS', 0, true),
  ('RACIK', 0, true),
  ('PSIKOTROPIKA', 0, true),
  ('OBAT RESEP', 0, true)
on conflict do nothing;

insert into public.subcategories (name, display_order, is_active)
values
  ('Alkes', 0, true),
  ('Bebas', 0, true),
  ('Cream', 0, true),
  ('Infus', 0, true),
  ('Injeksi', 0, true),
  ('Obat Tetes', 0, true),
  ('Supp', 0, true),
  ('Syrup', 0, true),
  ('Tablet', 0, true)
on conflict do nothing;

insert into public.tax_rates (name, rate, is_active)
values
  ('PPN 11%', 11.00, true),
  ('PPN 15%', 15.00, true),
  ('Tanpa Pajak', 0.00, true)
on conflict do nothing;
