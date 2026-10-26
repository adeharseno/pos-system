# M2.16D — Karyawan dan pengaturan akses

## Halaman dan komponen

- `/employees`: server-guarded Owner page; client workspace loads/revalidates all
  paginated employee rows through the existing protected API before filtering.
- List supports name/email search, role/status filters, desktop tables and mobile
  cards. Empty, loading, error, success and retry states use Bahasa Indonesia.
- Employee form creates an idempotent request, preserves inputs on error, and
  remembers a newly created employee before attempting invitation delivery.
- Existing employee email is read-only: account email replacement is not supported
  by the backend. Invite an unlinked employee using the dedicated invitation action.
- Inactive creation does not send email or reserve a login address. Activate the
  employee and use Kirim Undangan when ready.
- Role/activity changes use their existing APIs, require a reason, and require
  confirmation when removing access. Last usable Owner controls are visibly locked;
  database protection remains authoritative for concurrent requests.
- Permission groups use database definitions/presets and Indonesian labels, not
  new permission keys. Bawaan peran, individual settings, and calculated account
  permissions are shown separately. Individual changes save with a reason; null
  resets to the preset. Protected controls and unavailable features are read-only.

## Scope of individual permissions

The permission foundation can store allow/deny settings. Existing POS routes still
use the prior role guards until explicitly migrated. The interface explains this
limitation and does not promise that a new stored setting grants operational access.
Submission/approval, product deletion, audit pages and unsupported return-list
controls are not enabled by this milestone. No product or POS business logic changes.

## Account activation

`/auth/invite` still verifies the invite/recovery token on the server, but now
redirects to `/auth/activate` with only a safe ready/invalid status. The target is
derived from the configured trusted origin, never a request Host or caller URL.
The activation page independently checks the verified session and invitation
mapping; adding `status=ready` cannot bypass verification.

The password form validates length/confirmation and uses the existing password
endpoint. Inputs remain on request errors and are cleared after success. Lanjut ke
Login uses the existing logout action before login. Expired/invalid invitations
show a safe message asking the employee to request a new invitation.

No token is passed as a React prop or placed in the clean activation URL. Callback
request logging is suppressed in Next development logs; responses disable caching
and referrers. The existing JSON token-acceptance API remains compatible.

`APP_SITE_URL` remains the invitation destination. Optional
`APP_ADDITIONAL_ORIGINS` lists exact trusted browser origins, e.g. localhost as a
local alias for 127.0.0.1. Origins are validated; arbitrary hosts, ports, and suffix
matches are never trusted. These are server settings, not public credentials.

## Validation

- `npm run test:employees:ui`: search/filtering, Owner hints, retry eligibility,
  safe response parsing, label coverage, protected settings, form/password validation,
  configured origins and sanitized errors.
- Existing unit, pgTAP and concurrency suites remain applicable.
- `npm run test:employees:api` on a built local server (default port 3101) verifies
  employee-page authorization, invalid links, clean callback redirects, verified
  activation markup, account setup, and existing-session revocation. It uses only
  fictitious `.test` email recipients and requires local Mailpit.

No browser provider was available in this session. Interactive clicks, visual
layout and mobile viewport screenshots still need browser QA; responsive layout
was inspected in source and HTTP rendering was verified. No production connection,
new migration, or change to migrations 0001–0021 was required.

## Remaining work

Verify keyboard/focus behavior and 360px/mobile/desktop layouts in a browser.
Complete the deliberate POS endpoint/field-permission integration separately;
stored overrides do not replace existing role guards automatically. Terminal
email conflicts remain non-retryable to prevent account takeover. Account email
replacement/unlink recovery needs a future controlled backend capability.
Product submission/approval (M2.16E) has not started.
