# Authentication & Employee Sessions

Supabase Auth proves account identity; it does not by itself authorize POS
access. Server code verifies the Auth user, resolves `user_profiles.id` to
`user_profiles.employee_id`, loads the employee, and requires `is_active=true`.
Email matching is never used as the authorization relationship.

```text
auth.users.id -> user_profiles.id -> employees.id
```

The authorization authority is `employees.position`, not Auth
`app_metadata`. Current positions are `owner_admin`, `kasir`, and `staf`.
Operational POS access is granted only to the role required by the server-side
guard; `staf` has no cashier/transactional authority.

`src/proxy.ts` refreshes SSR auth cookies. Business authorization is performed
again in server layouts/actions through request-employee, position, or shared
capability guards. New routes should use capabilities when a definition exists;
legacy position-only routes are tracked in `current-status.md`. Business actions
must overwrite any caller identity with the returned
`EmployeeSession.employeeId`; browser-supplied employee IDs are untrusted.

## Controlled provisioning

Owner Admin manages employees and account invitations through `/employees`. The
server-side workflow reserves identity, provisions/links the Auth account, sends
activation, and records retryable delivery state without returning tokens or
credentials. Public/self signup remains outside the operational workflow.

To revoke business access without deleting history, deactivate the employee or
account through the supported admin workflow. Login accepts normalized email or
username and uses throttled/recorded failed-attempt handling. Activation and
password setup are implemented; a general public password-reset workflow is not
documented as a completed operational feature.
