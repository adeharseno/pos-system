"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireEmployee, logout } from "@/modules/auth/application/auth-service";
import { authenticate } from "@/modules/auth/application/login-defaults";
import { isAuthApplicationError } from "@/modules/auth/errors";

export async function loginAction(formData: FormData): Promise<never> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) redirect("/login?error=INVALID_CREDENTIALS");

  try {
    await authenticate({ identifier, password });
  } catch (error) {
    if (isAuthApplicationError(error) && error.code === "INVALID_CREDENTIALS") {
      redirect("/login?error=INVALID_CREDENTIALS");
    }
    throw error;
  }

  const supabase = await createServerSupabaseClient();
  try {
    await requireEmployee();
  } catch (employeeError) {
    await supabase.auth.signOut();
    const code = isAuthApplicationError(employeeError) ? employeeError.code : "UNAUTHENTICATED";
    redirect(`/login?error=${code}`);
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<never> {
  await logout();
  redirect("/login");
}
