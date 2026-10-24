-- Subcategory names are case- and surrounding-whitespace-insensitive within a category.
create unique index uq_subcategories_normalized_category_name
  on public.subcategories (category_id, lower(btrim(name)));
