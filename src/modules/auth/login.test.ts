import assert from "node:assert/strict";
import test from "node:test";

import { AuthApplicationError } from "./errors";
import {
  authenticateWith,
  nextFailure,
  parseIdentifier,
  LOGIN_LOCKOUT_MS,
  type LoginAttemptState,
  type LoginDependencies,
} from "./application/login-service";

const email = "admin@apotek.com";

function makeDeps(overrides: Partial<LoginDependencies> = {}) {
  const calls: string[] = [];
  let saved: LoginAttemptState | null | undefined;
  const deps: LoginDependencies = {
    resolveEmail: async () => { calls.push("resolve"); return email; },
    signIn: async () => { calls.push("signIn"); return true; },
    loadAttempt: async () => { calls.push("load"); return null; },
    saveAttempt: async (_identifier, state) => { calls.push("save"); saved = state; },
    ...overrides,
  };
  return { deps, calls, saved: () => saved };
}

async function expectInvalid(operation: () => Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) =>
    error instanceof AuthApplicationError && error.code === "INVALID_CREDENTIALS");
}

test("parseIdentifier distinguishes email from username and normalizes case", () => {
  assert.deepEqual(parseIdentifier(" Admin "), { kind: "username", value: "admin" });
  assert.deepEqual(parseIdentifier("Admin@Apotek.COM "), { kind: "email", value: "admin@apotek.com" });
  assert.equal(parseIdentifier("   "), null);
});

test("username login resolves the email then signs in and clears the attempt", async () => {
  const { deps, calls, saved } = makeDeps();
  await authenticateWith({ identifier: "admin", password: "secret" }, deps);
  assert.deepEqual(calls, ["load", "resolve", "signIn", "save"]);
  assert.equal(saved(), null);
});

test("email login signs in directly without resolving a username", async () => {
  let resolved = false;
  const { deps, calls } = makeDeps({ resolveEmail: async () => { resolved = true; return email; } });
  await authenticateWith({ identifier: email, password: "secret" }, deps);
  assert.equal(resolved, false);
  assert.deepEqual(calls, ["load", "signIn", "save"]);
});

test("unknown username fails with the generic error and records a failure", async () => {
  let resolved = false;
  const { deps, calls } = makeDeps({ resolveEmail: async () => { resolved = true; return null; } });
  await expectInvalid(() => authenticateWith({ identifier: "ghost", password: "secret" }, deps));
  assert.equal(resolved, true);
  assert.deepEqual(calls, ["load", "save"]);
});

test("wrong password fails with the generic error and records a failure", async () => {
  let signedIn = false;
  const { deps, calls } = makeDeps({ signIn: async () => { signedIn = true; return false; } });
  await expectInvalid(() => authenticateWith({ identifier: email, password: "wrong" }, deps));
  assert.equal(signedIn, true);
  assert.deepEqual(calls, ["load", "save"]);
});

test("a locked identifier is rejected before any email lookup or sign-in", async () => {
  const now = Date.now();
  let loaded = false;
  const { deps, calls } = makeDeps({ loadAttempt: async () => { loaded = true; return { failures: 0, lockedUntil: now + LOGIN_LOCKOUT_MS }; } });
  await expectInvalid(() => authenticateWith({ identifier: "admin", password: "secret" }, deps));
  assert.equal(loaded, true);
  assert.deepEqual(calls, []);
});

test("the 5th consecutive failure locks the identifier and resets the counter", async () => {
  const t0 = 1_000_000;
  assert.deepEqual(nextFailure({ failures: 4, lockedUntil: null }, t0), { failures: 0, lockedUntil: t0 + LOGIN_LOCKOUT_MS });
  assert.deepEqual(nextFailure(null, t0), { failures: 1, lockedUntil: null });
});
