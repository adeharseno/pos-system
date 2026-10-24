-- Category names are case- and surrounding-whitespace-insensitive master-data keys.
create unique index uq_categories_normalized_name
  on public.categories (lower(btrim(name)));
