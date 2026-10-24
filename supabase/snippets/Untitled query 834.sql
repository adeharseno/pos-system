select
  au.email,
  up.employee_id,
  up.display_name,
  e.full_name,
  e.position,
  e.is_active
from auth.users au
left join public.user_profiles up
  on up.id = au.id
left join public.employees e
  on e.id = up.employee_id
where au.email = 'owner@pos.local';