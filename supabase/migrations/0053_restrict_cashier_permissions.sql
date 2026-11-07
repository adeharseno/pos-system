-- Cashiers only need checkout reads/writes and the read-only transaction list.
-- Product, price, and stock reads are internal dependencies of /cashier.
delete from public.role_permissions where role = 'kasir';

insert into public.role_permissions(role, permission_code) values
  ('kasir', 'products.view'),
  ('kasir', 'pricing.selling.view'),
  ('kasir', 'inventory.view'),
  ('kasir', 'cashier.view'),
  ('kasir', 'sales.checkout'),
  ('kasir', 'transactions.view');
