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
again in server layouts/actions with `requireEmployee()` or `requireRole()`.
Future business actions must overwrite any caller identity with the returned
`EmployeeSession.employeeId`; browser-supplied employee IDs are untrusted.

## Controlled provisioning

1. An administrator creates the user in Supabase Dashboard → Authentication → Users. Disable public/self signup for the operational workflow.
2. Create the corresponding `employees` row with the correct `position` and `is_active=true`.
3. Insert one `user_profiles` row where `id` is the Auth user UUID and `employee_id` is the employee UUID; choose the required `display_name`.
4. Verify the mapping IDs carefully before sharing credentials. Do not use email matching or expose the service-role key.
5. To revoke business access without deleting history, set `employees.is_active=false`.

No registration, password-reset, or employee-management UI is part of M2.1.
