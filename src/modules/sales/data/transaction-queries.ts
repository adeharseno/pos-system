import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";

export async function getTransaction(transactionId:string) {
  const {data,error}=await createAdminSupabaseClient().from("transactions")
    .select("id,invoice_number,created_at,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,status,employees!transactions_cashier_id_fkey(full_name),transaction_items(quantity_in_unit,unit_price,total_amount,product_name_snapshot,unit_name_snapshot)")
    .eq("id",transactionId).maybeSingle();
  if(error) throw mapDatabaseError(error); return data;
}

export async function getReceiptTransaction(transactionId:string) {
  const {data,error}=await createAdminSupabaseClient().from("transactions")
    .select("id,invoice_number,created_at,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,status,employees!transactions_cashier_id_fkey(full_name),transaction_items(quantity_in_unit,unit_price,total_amount,product_name_snapshot,unit_name_snapshot)")
    .eq("id",transactionId).maybeSingle();
  if(error) throw mapDatabaseError(error); return data;
}
