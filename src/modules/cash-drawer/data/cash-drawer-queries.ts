import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";

export async function getOpenCashDrawer(employeeId:string) {
  const {data,error}=await createAdminSupabaseClient().from("cash_drawer_sessions")
    .select("id,employee_id,opening_balance,opened_at,is_open").eq("employee_id",employeeId).eq("is_open",true).maybeSingle();
  if(error) throw mapDatabaseError(error); return data;
}
