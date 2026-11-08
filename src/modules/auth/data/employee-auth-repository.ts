import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PosDataAccessError } from "@/modules/shared/errors/pos-domain-error";
import type { AuthenticatedUser, EmployeeRecord } from "../types";

export async function getVerifiedAuthUser(): Promise<AuthenticatedUser | null> {
  const { data, error } = await (await createServerSupabaseClient()).auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

export async function findEmployeeByAuthUserId(authUserId: string): Promise<EmployeeRecord | null> {
  // Single RPC replaces the previous three sequential queries:
  //   employee_account_access → user_profiles SELECT → employees SELECT
  const admin = createAdminSupabaseClient();
  const result = await admin.rpc("resolve_employee_session", { p_auth_user: authUserId });
  if (result.error) throw new PosDataAccessError(result.error);
  const row = result.data as { employee_id: string; name: string; role: string; is_active: boolean } | null;
  if (!row) return null;
  return {
    employeeId: row.employee_id,
    name: row.name,
    role: row.role as EmployeeRecord["role"],
    isActive: row.is_active,
  };
}

export async function signOutAuthUser(): Promise<void> {
  const { error } = await (await createServerSupabaseClient()).auth.signOut();
  if (error) throw new PosDataAccessError(error);
}
