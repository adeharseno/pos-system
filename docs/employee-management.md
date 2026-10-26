# M2.16C: Employee management backend

M2.16D now provides the Karyawan and account activation UI. See
[employee-ui.md](employee-ui.md) for the current callback behavior: `/auth/invite`
redirects to a clean activation page; the JSON acceptance API remains available.
The backend-only UI notes below describe the original M2.16C delivery.

No Employee UI or product approval workflow is included. Existing POS role guards
remain unchanged. The Auth repository additionally denies pending invitations,
banned Auth users and inactive employees on every protected request.

## API contract

All employee endpoints require a verified, active, usable Owner Admin AND the
corresponding capability from the existing permission resolver. Overrides cannot
delegate employee administration. Database RPCs revalidate the actor inside their
transaction. API responses use the existing `{ok,data}` / `{ok,error}` envelope,
Bahasa Indonesia messages, and `private, no-store` headers.

| Method | Endpoint | Body / behavior |
| --- | --- | --- |
| GET | `/api/employees?limit=50&offset=0` | Safe paginated rows; maximum 100 |
| POST | `/api/employees` | `request_id` UUID, `full_name`, optional `position`, `phone`, `join_date`, required `reason` |
| GET | `/api/employees/[id]` | Employee and safe account status |
| PATCH | `/api/employees/[id]` | `full_name`, `phone`, `join_date`; required `reason` |
| PATCH | `/api/employees/[id]/access` | `is_active` boolean, `reason` |
| PATCH | `/api/employees/[id]/role` | `position`: owner_admin / kasir / staf, `reason` |
| GET | `/api/employees/[id]/permissions` | Preset, overrides and effective capabilities; no effective access if account disabled/unprovisioned |
| PATCH | `/api/employees/[id]/permissions` | `permission`, `effect`: allow / deny / null (remove), `reason` |
| POST | `/api/employees/[id]/invite` | `email`; same endpoint retries an invitation for the same employee/email |

Unknown request fields are rejected. Identity, Auth IDs, role metadata, invitation
state and redirect URLs cannot be supplied by the caller. Creation request IDs
prevent duplicate employees; a reused ID with differing creation values conflicts.
Protected employee/admin/approval overrides and Owner overrides are rejected.
Role changes preserve ordinary individual overrides; Owner always has full control.

## Invitation workflow

Configure server-only `APP_SITE_URL` to the trusted application origin. Cross-origin
browser administration requests are rejected. Redirects never use request Host or
caller input. Local Supabase uses the checked-in invite/recovery templates; after
changing templates, restart the local stack without resetting its database.

1. A database reservation owns a normalized unique email and a fixed Auth UUID.
2. Claiming creates a five-minute worker lease; parallel attempts are rejected.
3. Auth Admin creates that UUID without generating a password. A retry first looks
   up this exact UUID. Unrelated existing email accounts are never adopted.
4. A database command verifies UUID/email and links user_profiles to the employee.
5. Auth sends the invitation. Delivery is recorded separately and audited.
6. The recipient verifies the invitation and chooses a password. Only then is the
   account marked active and permitted to access POS operations.

States: `retryable` (reserved/in progress or transient failure), `invited`, `active`,
and `failed` (terminal email conflict). Safe employee responses also report
`not_invited` and `disabled`. Transient error codes are sanitized; raw Auth errors,
tokens, password material and service credentials are never returned or audited.

If an external response or database acknowledgment is lost, retry resumes the
reserved UUID. A lease whose worker cannot record failure expires automatically.
Delivery is at-least-once: a response lost after email delivery can cause a resend,
but never a second employee or Auth account. A confirmed-but-incomplete invitation
uses Auth recovery delivery to the same linked account on retry. Email changes for
failed invitations and account unlinking are deliberately not exposed by an API;
they require a separate controlled recovery design, not takeover of another user.

## Acceptance and password setup (backend only)

- `GET /auth/invite?token_hash=...&type=invite` verifies the emailed token and sets
  SSR session cookies. The optional `type=recovery` supports safe setup retry.
- `POST /api/auth/invitations/accept` accepts `{token_hash,type?}` for a future client.
- `POST /api/auth/invitations/password` accepts `{password}` using the verified
  session cookie; minimum 12, maximum 128 characters. It checks the active employee
  mapping before and after the Auth password operation.

The callback returns JSON, not a password form. M2.16D must build the account setup
client using these endpoints. Tokens must stay out of analytics/access-log query
capture; this backend never persists or audits them. Responses disable caching and
referrers. Email verification alone does not authorize access. Editable user metadata
is never an authorization source. A recipient may retry setup after an interrupted
password save without creating another user.

## Security and database migration

Migration 0021 adds the unique employee creation request key, private invitation
state, and server-only RPCs. It changes no prior migration file. RLS/browser grants
deny invitation-table and RPC access. Security-definer functions fix search_path
and accept only the verified Auth identity from server code.
Apply the additive migration before deploying code that calls these new RPCs.
This milestone applied and tested it only against the local development database.

Administrative changes, actor revalidation, permissions, account linking and
acceptance serialize through the existing written access-guard row. Last usable
Owner checks cover role downgrade, deactivation, profile unlink/reassignment, Auth
ban, and Auth deletion. An unlinked or pending-invitation Owner is not a replacement
for the final usable Owner. Changing a role or activity records actor/reason through
the existing access-audit trigger; other managed operations have explicit events.
Direct maintenance outside these APIs can have an unattributed actor.

## Local tests

- `npm run test:employees`: validation, recoverable workflow and error contracts; mocked delivery.
- `npm run db:test`: transactional pgTAP fixtures including administration and last usable Owner.
- `npm run test:employees:concurrency`: real concurrent requests at the database boundary.
- Start the built app on port 3101, then `npm run test:employees:api`: real local HTTP,
  Auth creation/invitation, acceptance, password setup and disabled-session tests.
  It refuses non-loopback services and requires Docker Mailpit SMTP. Only fictitious
  `.test` addresses are used. It never prints passwords/tokens and removes its fixtures.

No test uses production, db push, db reset, or migration repair.

## M2.16D

Build responsive Bahasa Indonesia employee/account/permission pages, account setup
form, safe retry feedback and navigation. Display preset versus override clearly,
require reasons for changes, and explain protected Owner controls. Existing POS
API permission migration remains explicit work; no new ordinary override changes
legacy POS role behavior automatically.
