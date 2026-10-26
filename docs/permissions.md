# M2.16B: Permission foundation

Authentication remains Supabase Auth -> user_profiles -> active employees.
The existing `requireRole` and `requirePosOperator` contracts are unchanged.
No existing route, sensitive response, or business workflow uses new grants yet.

## Server use

Import `requirePermission` or `requireAllPermissions` from
`modules/auth/application/auth-service`. Both return the verified EmployeeSession.
Pass capability names from `modules/auth/permissions.ts`.
Each call reloads the current employee and permission data; there is no shared cache.
Empty requirements, unknown capabilities, missing definitions, and store errors fail closed.
Owner Admin has every known database-defined capability, regardless of overrides.
Other employees use explicit overrides before presets; missing capabilities are denied.

Migration 0020 presets preserve existing behavior: cashier retains operational
access without cost/margin, administration, or product submissions; staff retains
dashboard access only. Capability definitions are not grants. Submission and
approval capabilities are reserved for subsequent implementation.

## Database boundary

RLS is enabled and browser roles have no privileges on the new tables or RPCs.
Service role can read permission/audit tables but cannot directly write them.
Definitions and presets are migration-owned. New presets require reviewed migrations.
The override RPC accepts a verified Auth user ID supplied by trusted server code,
requires an active mapped Owner, a known permission and a nonempty reason, and
serializes changes per target employee. `null` effect removes an override.
It rejects Owner overrides; real changes and their before/after audit event commit
together. It is not exposed by an HTTP API in this milestone.

Employee update/delete statements serialize through an internal guard row;
row triggers prevent deactivation, demotion, or deletion of the final active Owner.
The written guard also prevents stale repeatable-read transactions from bypassing
the check. Role/activity changes produce audit events; direct maintenance writes
have no attributed actor. Audits contain no product pricing, credentials, or tokens.
This protects active employee roles, not future Auth bans or profile unlinking.

## M2.16C integration

Build controlled employee/account provisioning and invitation flows. Add trusted
actor attribution to account-access RPCs, and protect the last usable Owner across
Auth access changes and profile unlinking. Auth and database provisioning need
retry/compensation because they do not share a transaction.

Migrate each route/service explicitly before applying individual grants to it.
Enforce field permissions using explicit read/write DTOs, not hidden UI elements.
Existing SQL role requirements remain authoritative until deliberately migrated.
Employee and product approval UI are not part of this foundation.

## Validation

`npm run test:permissions` tests the pure policy and catalog consistency.
`supabase test db --local supabase/tests/database/permission_foundation.test.sql`
tests presets, grants/RLS, audit, overrides, inactive access and last-owner rules.
Database test fixtures and temporary access changes run in a rolled-back transaction.
Use only a local development database; never reset or push production for these tests.

Database types include the new public permission entities and RPCs only. Existing
generated type drift (including bank-transfer return contracts) is intentionally
outside this milestone and needs a separate reconciliation.
