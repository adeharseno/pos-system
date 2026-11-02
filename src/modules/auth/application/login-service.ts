import { AuthApplicationError } from "../errors";

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface LoginAttemptState {
  failures: number;
  lockedUntil: number | null;
}

export interface LoginDependencies {
  resolveEmail: (username: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<boolean>;
  loadAttempt: (identifier: string) => Promise<LoginAttemptState | null>;
  saveAttempt: (identifier: string, state: LoginAttemptState | null) => Promise<void>;
  now?: () => number;
}

/** Lowercases and trims the identifier; "@" decides whether it is an email. */
export function parseIdentifier(raw: string): { kind: "email" | "username"; value: string } | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  return value.includes("@") ? { kind: "email", value } : { kind: "username", value };
}

export function nextFailure(attempt: LoginAttemptState | null, nowMs: number): LoginAttemptState {
  const failures = (attempt?.failures ?? 0) + 1;
  if (failures >= LOGIN_MAX_FAILURES) return { failures: 0, lockedUntil: nowMs + LOGIN_LOCKOUT_MS };
  return { failures, lockedUntil: attempt?.lockedUntil ?? null };
}

/**
 * Resolves an identifier to a Supabase Auth email and signs in. The resolved
 * email is never returned: unknown usernames, wrong passwords, and lockouts all
 * surface the same generic INVALID_CREDENTIALS error.
 */
export async function authenticateWith(input: LoginInput, dependencies: LoginDependencies): Promise<void> {
  const parsed = parseIdentifier(input.identifier);
  if (!parsed || !input.password) throw new AuthApplicationError("INVALID_CREDENTIALS");

  const key = parsed.value;
  const now = dependencies.now ?? Date.now;

  const attempt = await dependencies.loadAttempt(key);
  if (attempt && attempt.lockedUntil !== null && attempt.lockedUntil > now()) {
    throw new AuthApplicationError("INVALID_CREDENTIALS");
  }

  let email: string;
  if (parsed.kind === "username") {
    const resolved = await dependencies.resolveEmail(parsed.value);
    if (!resolved) {
      await dependencies.saveAttempt(key, nextFailure(attempt, now()));
      throw new AuthApplicationError("INVALID_CREDENTIALS");
    }
    email = resolved;
  } else {
    email = parsed.value;
  }

  const signedIn = await dependencies.signIn(email, input.password);
  if (!signedIn) {
    await dependencies.saveAttempt(key, nextFailure(attempt, now()));
    throw new AuthApplicationError("INVALID_CREDENTIALS");
  }

  await dependencies.saveAttempt(key, null);
}
