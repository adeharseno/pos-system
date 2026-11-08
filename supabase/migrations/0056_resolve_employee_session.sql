begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

-- Collapses the three sequential queries in findEmployeeByAuthUserId:
--   1. employee_account_access (EXISTS check)
--   2. user_profiles SELECT
--   3. employees SELECT
-- into a single RPC returning all needed employee session data.
-- Preserves the exact account active checks:
--   - employee.is_active
--   - auth.users.banned_until <= current_timestamp (STABLE-safe)
--   - employee_invitations status (NULL or non-active status is strictly denied)
--   - missing employees row falls back to inactive staf record
create or replace function public.resolve_employee_session(p_auth_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'employee_id', coalesce(e.id, p.employee_id),
    'name',        coalesce(e.full_name, ''),
    'role',        coalesce(e.position, 'staf'),
    'is_active',   (
      e.id is not null
      and e.is_active
      and (a.banned_until is null or a.banned_until <= current_timestamp)
      and not exists (
        select 1 from public.employee_invitations i
        where i.employee_id = p.employee_id and coalesce(i.status, '') <> 'active'
      )
    )
  )
  from auth.users a
  join public.user_profiles p on p.id = a.id
  left join public.employees e on e.id = p.employee_id
  where a.id = p_auth_user
  limit 1;
$$;

revoke all on function public.resolve_employee_session(uuid) from public, anon, authenticated;
grant execute on function public.resolve_employee_session(uuid) to service_role;

commit;
