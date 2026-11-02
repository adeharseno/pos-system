BEGIN;

-- Username login: a stable, lowercase handle derived from the employee's email
-- local-part. Backfilled before the NOT NULL constraint is applied.
alter table public.employees add column username text;

do $$
declare
  r record;
  base text;
  candidate text;
  suffix int;
begin
  for r in
    select e.id,
           lower(regexp_replace(split_part(a.email, '@', 1), '[^a-z0-9._-]', '', 'g')) as local_part
    from public.employees e
    left join public.user_profiles p on p.employee_id = e.id
    left join auth.users a on a.id = p.id
    order by e.created_at nulls last, e.id
  loop
    base := coalesce(nullif(r.local_part, ''), 'user');
    if length(base) < 3 then
      base := base || repeat('u', 3 - length(base));
    end if;
    base := left(base, 30);
    candidate := base;
    suffix := 0;
    while exists (select 1 from public.employees where lower(username) = candidate) loop
      suffix := suffix + 1;
      candidate := left(base, 30 - length(suffix::text)) || suffix::text;
    end loop;
    update public.employees set username = candidate where id = r.id;
  end loop;
end;
$$;

alter table public.employees
  add constraint employees_username_format check (username ~ '^[a-z0-9._-]{3,30}$');
create unique index employees_username_lower_unique on public.employees (lower(username));
alter table public.employees alter column username set not null;

-- Employees created after this migration are assigned an auto username so the
-- NOT NULL column keeps the existing provisioning path working. Administrators
-- can set a friendlier handle once the employee UI exposes it.
create sequence public.employee_username_seq;
alter table public.employees alter column username
  set default ('user_' || lpad(nextval('public.employee_username_seq')::text, 3, '0'));
grant usage on sequence public.employee_username_seq to service_role;

-- Per-identifier login attempt limiting (5 failures -> 5 minute lockout).
-- The threshold and lockout window are enforced by the application service;
-- this table only persists the attempt state.
create table public.login_attempts (
  identifier text primary key,
  failures integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.login_attempts to service_role;
create policy "deny_all_client_access" on public.login_attempts
  for all to authenticated, anon using (false);

-- Resolve the login email from a username. Email lives in the auth schema,
-- which browser roles can never query, so this is service_role only.
create function public.find_login_email_by_username(p_username text) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select a.email
  from public.user_profiles p
  join public.employees e on e.id = p.employee_id
  join auth.users a on a.id = p.id
  where lower(e.username) = p_username
  limit 1;
$$;

create function public.login_attempt_get(p_identifier text) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select case
    when a.identifier is null then null
    else jsonb_build_object('failures', a.failures, 'locked_until', a.locked_until)
  end
  from public.login_attempts a
  where a.identifier = p_identifier;
$$;

create function public.login_attempt_set(p_identifier text, p_failures integer, p_locked_until timestamptz) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if p_failures <= 0 and p_locked_until is null then
    delete from public.login_attempts where identifier = p_identifier;
  else
    insert into public.login_attempts (identifier, failures, locked_until)
    values (p_identifier, p_failures, p_locked_until)
    on conflict (identifier) do update
      set failures = excluded.failures,
          locked_until = excluded.locked_until,
          updated_at = now();
  end if;
end;
$$;

revoke all on function public.find_login_email_by_username(text),
  public.login_attempt_get(text), public.login_attempt_set(text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.find_login_email_by_username(text),
  public.login_attempt_get(text), public.login_attempt_set(text, integer, timestamptz)
  to service_role;

COMMIT;
