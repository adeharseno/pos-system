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
  const admin = createAdminSupabaseClient();
  const access = await admin.rpc("employee_account_access", { p_auth_user: authUserId });
  if (access.error) throw new PosDataAccessError(access.error);
  if (!access.data) {
    // Preserve the existing inactive/missing mapping errors from the policy layer.
    const profile = await admin.from("user_profiles").select("employee_id").eq("id", authUserId).maybeSingle();
    if (profile.error) throw new PosDataAccessError(profile.error);
    if (!profile.data?.employee_id) return null;
    return { employeeId: profile.data.employee_id, name: "", role: "staf", isActive: false };
  }
  const profile = await admin.from("user_profiles").select("employee_id").eq("id", authUserId).maybeSingle();
  if (profile.error) throw new PosDataAccessError(profile.error);
  if (!profile.data?.employee_id) return null;

  const employee = await admin.from("employees").select("id,full_name,position,is_active")
    .eq("id", profile.data.employee_id).maybeSingle();
  if (employee.error) throw new PosDataAccessError(employee.error);
  if (!employee.data) return null;
  return {
    employeeId: employee.data.id,
    name: employee.data.full_name,
    role: employee.data.position,
    isActive: employee.data.is_active,
  };
}

export async function signOutAuthUser(): Promise<void> {
  const { error } = await (await createServerSupabaseClient()).auth.signOut();
  if (error) throw new PosDataAccessError(error);
}
