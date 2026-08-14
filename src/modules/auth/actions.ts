"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireEmployee, logout } from "@/modules/auth/application/auth-service";
import { isAuthApplicationError } from "@/modules/auth/errors";

export async function loginAction(formData: FormData): Promise<never> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=INVALID_CREDENTIALS");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=INVALID_CREDENTIALS");

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
