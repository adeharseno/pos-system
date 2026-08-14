import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";

export async function getTransaction(transactionId:string) {
  const {data,error}=await createAdminSupabaseClient().from("transactions")
    .select("*,transaction_items(*,transaction_item_batches(*)),transaction_prescriptions(*)")
    .eq("id",transactionId).maybeSingle();
  if(error) throw mapDatabaseError(error); return data;
}
