import assert from "node:assert/strict";
import test from "node:test";
import { canInvite, filterEmployees, lastUsableOwner, knownPermissions, parseEmployeeAccess, parseEmployees, protectedPermission, type EmployeeRow } from "./employee-ui-model";
import { employeeFormError, passwordSetupError } from "./employee-form-rules";
import { employeeOriginAllowed, permissionChange } from "./employee-validation";
import { PERMISSIONS } from "./permissions";
import { PERMISSION_GROUPS, PERMISSION_LABELS } from "./permission-labels";
import { employeeRequest, EmployeeUiError } from "./components/employee-request";

const owner: EmployeeRow = { id: "owner", full_name: "Pemilik Apotek", position: "owner_admin", email: "owner@example.test", phone: null,
  join_date: "2026-01-01", is_active: true, account_status: "active", retryable: false };
const cashier: EmployeeRow = { ...owner, id: "cashier", position: "kasir", full_name: "Ani Kasir", email: "ani@example.test" };
const staff: EmployeeRow = { ...owner, id: "staff", position: "staf", full_name: "Budi", email: null, account_status: "not_invited" };

test("employee search and combined filters match name/email, role and account status", () => {
  const rows = [owner, cashier, staff];
  assert.deepEqual(filterEmployees(rows, " ANI@EXAMPLE ", "kasir", "active"), [cashier]);
  assert.deepEqual(filterEmployees(rows, "budi", "staf", "not_invited"), [staff]);
  assert.deepEqual(filterEmployees(rows, "missing", "", ""), []);
  assert.deepEqual(filterEmployees([], "", "", ""), []);
});
test("last Owner hint counts usable owners across the unfiltered list", () => {
  assert.equal(lastUsableOwner([owner, cashier], owner), true);
  assert.equal(lastUsableOwner([owner, { ...owner, id: "pending", account_status: "invited" }], owner), true);
  assert.equal(lastUsableOwner([owner, { ...owner, id: "disabled", is_active: false, account_status: "disabled" }], owner), true);
  assert.equal(lastUsableOwner([owner, { ...owner, id: "second" }], owner), false);
  assert.equal(lastUsableOwner([owner, cashier], cashier), false);
});
test("only supported invitation retries are offered", () => {
  assert.equal(canInvite(staff), true);
  assert.equal(canInvite({ ...staff, account_status: "invited" }), true);
  assert.equal(canInvite({ ...staff, account_status: "retryable", retryable: true }), true);
  assert.equal(canInvite({ ...staff, account_status: "retryable", retryable: false }), false);
  assert.equal(canInvite({ ...staff, account_status: "failed" }), false);
  assert.equal(canInvite({ ...staff, is_active: false }), false);
  assert.equal(canInvite(cashier), false);
});
test("employee responses are whitelisted and malformed payloads fail safely", () => {
  assert.deepEqual(parseEmployees([{ ...cashier, access_token: "not-returned", cost_price: 999 }]), [cashier]);
  assert.throws(() => parseEmployees([{ ...cashier, position: "administrator" }]));
  assert.throws(() => parseEmployees({ rows: [] }));
});
test("permissions use known backend definitions and retain inheritance and overrides", () => {
  const result = parseEmployeeAccess({ role: "kasir", is_active: true, account_enabled: true,
    definitions: ["products.view", "unknown.key"], preset: ["products.view"], effective: [],
    overrides: [{ permission: "products.view", effect: "deny" }, { permission: "unknown.key", effect: "allow" }] });
  assert.deepEqual(result.definitions, ["products.view"]);
  assert.deepEqual(result.preset, ["products.view"]);
  assert.deepEqual(result.overrides, [{ permission: "products.view", effect: "deny" }]);
  assert.deepEqual(knownPermissions(["unknown.key", "pricing.cost.view"]), ["pricing.cost.view"]);
});
test("UI administrative protection matches backend permission validation", () => {
  for (const permission of PERMISSIONS) {
    if (protectedPermission(permission)) assert.throws(() => permissionChange({ permission, effect: "allow", reason: "test" }));
    else assert.equal(permissionChange({ permission, effect: "deny", reason: "test" }).permission, permission);
  }
});
test("every known permission has an Indonesian label and supported feature group", () => {
  assert.deepEqual(Object.keys(PERMISSION_LABELS).sort(), [...PERMISSIONS].sort());
  for (const value of Object.values(PERMISSION_LABELS)) {
    assert.ok(PERMISSION_GROUPS.includes(value.group));
    assert.ok(value.label.length > 5);
  }
});
test("form validation supports inactive accounts and rejects incomplete or invalid information", () => {
  const values = { name: "Ani", email: "ani@example.test", phone: "", date: "2026-01-01", reason: "Penambahan", needsEmail: true };
  assert.equal(employeeFormError(values), null);
  assert.match(employeeFormError({ ...values, email: "invalid" })!, /email/);
  assert.match(employeeFormError({ ...values, date: "2026-02-30" })!, /tanggal/);
  assert.match(employeeFormError({ ...values, reason: " " })!, /alasan/);
  assert.equal(employeeFormError({ ...values, email: "", needsEmail: false }), null);
});
test("password setup validates length and confirmation without altering entered values", () => {
  assert.match(passwordSetupError("short", "short")!, /12 hingga 128/);
  assert.match(passwordSetupError("TwelveCharacters!", "DifferentValue!")!, /belum sama/);
  assert.equal(passwordSetupError("TwelveCharacters!", "TwelveCharacters!"), null);
});
test("explicit local aliases are allowed while unconfigured and deceptive origins stay denied", () => {
  assert.equal(employeeOriginAllowed("http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3000"), true);
  assert.equal(employeeOriginAllowed("http://localhost:3000", "http://127.0.0.1:3000"), false);
  assert.equal(employeeOriginAllowed("http://localhost:3001", "http://127.0.0.1:3000", "http://localhost:3000"), false);
  assert.equal(employeeOriginAllowed("https://pos.example.test.evil.test", "https://pos.example.test"), false);
});
test("API errors never display raw transport errors or unknown response messages", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: { code: "UNKNOWN", message: "secret SQL credential" } }), { status: 500 });
    await assert.rejects(() => employeeRequest("/api/employees"), error => error instanceof EmployeeUiError && !error.message.includes("secret"));
    globalThis.fetch = async () => { throw new Error("secret network internals"); };
    await assert.rejects(() => employeeRequest("/api/employees"), error => error instanceof EmployeeUiError && error.message.includes("koneksi") && !error.message.includes("secret"));
  } finally { globalThis.fetch = original; }
});
