"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env/public";

export function createBrowserSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
