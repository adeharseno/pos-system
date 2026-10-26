import assert from "node:assert/strict";
import test from "node:test";
import { employeeValues, invitationRedirect, normalizeEmail, permissionChange } from "./employee-validation";
import { inviteEmployeeWith, type InvitationDependencies } from "./application/invitation-workflow";
import { EmployeeManagementError } from "./employee-errors";
import { mapApiError } from "../shared/api/response";
import { executeEmployeeApi } from "./employee-api";

const request_id = "30000000-0000-4000-8000-000000000001";
test("employee create uses explicit fields and conservative default role", () => {
  assert.deepEqual(employeeValues({ request_id, full_name: " Staf Baru ", reason: "pegawai baru" }, true), {
    request_id, full_name: "Staf Baru", position: "staf",
  });
  assert.deepEqual(employeeValues({ full_name: " Nama Baru ", phone: null, reason: "koreksi" }, false), { full_name: "Nama Baru", phone: null });
});
test("mass assignment, forged identity, invalid dates and role injection are rejected", () => {
  for (const injected of [{ position: "owner_admin" }, { is_active: true }, { actor: request_id }, { employee_id: request_id }, { user_metadata: { role: "owner_admin" } }]) {
    assert.throws(() => employeeValues({ full_name: "Staf", reason: "test", ...injected }, false));
  }
  assert.throws(() => employeeValues({ full_name: "Staf", join_date: "2026-02-30" }, false));
});
test("permission validation rejects unknown and protected administrative capabilities", () => {
  for (const permission of ["employees.edit", "permissions.manage", "audit.view", "submissions.approve", "products.activate", "made.up"]) {
    assert.throws(() => permissionChange({ permission, effect: "allow", reason: "test" }));
  }
  assert.deepEqual(permissionChange({ permission: "products.view", effect: null, reason: "pulihkan" }), { permission: "products.view", effect: null, reason: "pulihkan" });
});
test("email is normalized and redirects require an explicitly configured trusted origin", () => {
  assert.equal(normalizeEmail(" Test@Example.test "), "test@example.test");
  assert.equal(invitationRedirect("http://127.0.0.1:3000"), "http://127.0.0.1:3000/auth/invite");
  assert.equal(invitationRedirect("https://pos.example.test"), "https://pos.example.test/auth/invite");
  for (const url of [undefined, "http://evil.test", "https://user:pass@example.test", "https://example.test/?next=evil", "javascript:alert(1)"]) assert.throws(() => invitationRedirect(url));
});

function workflow(failure?: "ensureUser" | "link" | "send" | "sent") {
  const calls: string[] = [];
  const claim = { employee_id: "employee", auth_user_id: "reserved", email: "fake@example.test", attempt_id: "attempt", status: "retryable" };
  const deps: InvitationDependencies = {
    claim: async () => { calls.push("claim"); return claim; },
    ensureUser: async row => { assert.equal(row.auth_user_id, "reserved"); calls.push("ensureUser"); if (failure === "ensureUser") throw new Error("secret token must not escape"); },
    link: async () => { calls.push("link"); if (failure === "link") throw new Error("db failed"); },
    send: async () => { calls.push("send"); if (failure === "send") throw new Error("email failed"); },
    sent: async () => { calls.push("sent"); if (failure === "sent") throw new Error("response lost"); },
    fail: async (_row, code) => { calls.push(code); },
  };
  return { deps, calls };
}
test("invitation succeeds without returning credentials or internal claim IDs", async () => {
  const { deps, calls } = workflow();
  assert.deepEqual(await inviteEmployeeWith(deps), { status: "invited", message: "Undangan berhasil dikirim." });
  assert.deepEqual(calls, ["claim", "ensureUser", "link", "send", "sent"]);
});
test("provisioning and delivery failures remain recoverable and sanitized", async () => {
  for (const phase of ["ensureUser", "link", "send", "sent"] as const) {
    const { deps, calls } = workflow(phase);
    await assert.rejects(() => inviteEmployeeWith(deps), error => error instanceof EmployeeManagementError &&
      error.code === (phase === "ensureUser" || phase === "link" ? "PROVISIONING_FAILED" : "DELIVERY_FAILED"));
    assert.ok(calls.includes(phase === "ensureUser" || phase === "link" ? "PROVISIONING_FAILED" : "DELIVERY_FAILED"));
  }
});
test("duplicate/concurrent claim fails before any Auth or delivery call", async () => {
  const { deps, calls } = workflow();
  deps.claim = async () => { throw new EmployeeManagementError("INVITATION_BUSY"); };
  await assert.rejects(() => inviteEmployeeWith(deps), /INVITATION_BUSY/);
  assert.deepEqual(calls, []);
});
test("failure persistence outage does not leak transport errors; lease permits later retry", async () => {
  const { deps } = workflow("send"); deps.fail = async () => { throw new Error("database down"); };
  await assert.rejects(() => inviteEmployeeWith(deps), /DELIVERY_FAILED/);
});
test("conflicting account is never adopted or retried as an unrelated user", async () => {
  const { deps, calls } = workflow();
  deps.ensureUser = async () => { throw new EmployeeManagementError("EMAIL_CONFLICT"); };
  await assert.rejects(() => inviteEmployeeWith(deps), /EMAIL_CONFLICT/);
  assert.deepEqual(calls, ["claim", "EMAIL_CONFLICT"]);
});
test("employee API errors have safe Bahasa Indonesia messages", async () => {
  const response = mapApiError(new EmployeeManagementError("LAST_ACTIVE_OWNER"));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error.message, /Pemilik aktif terakhir/);
});
test("employee API success and failure responses prevent caching and referrer leakage", async () => {
  const success = await executeEmployeeApi(async () => ({ message: "Berhasil." }));
  const failure = await executeEmployeeApi(async () => { throw new EmployeeManagementError("FORBIDDEN"); });
  for (const response of [success, failure]) {
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  }
  assert.equal(failure.status, 403);
});
