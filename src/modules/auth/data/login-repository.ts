import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { LoginAttemptState } from "../application/login-service";

type RpcError = { message: string } | null;

function adminRpc(name: string, args: Record<string, unknown>) {
  const client = createAdminSupabaseClient();
  const rpc = client.rpc.bind(client) as unknown as
    (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError }>;
  return rpc(name, args);
}

export async function resolveEmailByUsername(username: string): Promise<string | null> {
  const { data, error } = await adminRpc("find_login_email_by_username", { p_username: username });
  if (error) throw new Error("Login lookup failed");
  return typeof data === "string" ? data : null;
}

export async function signInWithEmailPassword(email: string, password: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export async function loadLoginAttempt(identifier: string): Promise<LoginAttemptState | null> {
  const { data, error } = await adminRpc("login_attempt_get", { p_identifier: identifier });
  if (error) throw new Error("Login attempt lookup failed");
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as { failures?: unknown; locked_until?: unknown };
  return {
    failures: typeof row.failures === "number" ? row.failures : 0,
    lockedUntil: typeof row.locked_until === "string" ? Date.parse(row.locked_until) : null,
  };
}

export async function saveLoginAttempt(identifier: string, state: LoginAttemptState | null): Promise<void> {
  const { error } = await adminRpc("login_attempt_set", {
    p_identifier: identifier,
    p_failures: state?.failures ?? 0,
    p_locked_until: state?.lockedUntil != null ? new Date(state.lockedUntil).toISOString() : null,
  });
  if (error) throw new Error("Login attempt recording failed");
}
