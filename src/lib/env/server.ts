import "server-only";

import { getPublicEnv } from "@/lib/env/public";

type ServerEnv = ReturnType<typeof getPublicEnv> &
  Readonly<{
    supabaseServiceRoleKey: string;
  }>;

export function getServerEnv(): ServerEnv {
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey) {
    throw new Error(
      "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return {
    ...getPublicEnv(),
    supabaseServiceRoleKey,
  };
}
