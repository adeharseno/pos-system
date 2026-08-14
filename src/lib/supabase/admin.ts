import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env/server";
import type { Database } from "@/types/database.types";

export function createAdminSupabaseClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getServerEnv();

  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
