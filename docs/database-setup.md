# Database Setup — M1.2

The local Supabase stack is controlled by `supabase/config.toml`. The database
is reproducible from the checked-in migrations; no dashboard SQL is required.

## Local workflow

Docker Desktop must be running.

```bash
npm run supabase:start
npm run db:reset
npm run db:lint
```

`db:reset` recreates the local database and applies, in order:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_rls_policies.sql`

Seeding is disabled for M1.2 because seed data belongs to a later milestone.

## Remote workflow

Remote linking requires developer-owned Supabase credentials and must remain
local state:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Never commit the access token, project database password, generated temporary
CLI state, or application secrets. Review the pending migrations before every
remote `db push`.

## M1.2 migration fix

An actual PostgreSQL catalog verification showed that, with the current
Supabase default that does not auto-expose new public tables, `service_role`
did not receive CRUD privileges. RLS bypass alone is insufficient without SQL
table privileges. The RLS migration now:

- revokes every table privilege from `anon` and `authenticated`, including
  `TRUNCATE`, which is outside RLS enforcement; and
- grants `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on current public tables to
  `service_role`.

RLS remains enabled with deny-all policies for both browser roles.
