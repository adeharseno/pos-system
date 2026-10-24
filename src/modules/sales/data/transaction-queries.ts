import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";

export async function getTransaction(transactionId:string) {
  const {data,error}=await createAdminSupabaseClient().from("transactions")
    .select("id,invoice_number,created_at,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,status,employees!transactions_cashier_id_fkey(full_name),transaction_items(id,quantity_in_unit,quantity_in_base,conversion_to_base_snapshot,unit_price,total_amount,product_name_snapshot,unit_name_snapshot)")
    .eq("id",transactionId).maybeSingle();
  if(error) throw mapDatabaseError(error); return data;
}

export async function getReceiptTransaction(transactionId:string) {
  const {data,error}=await createAdminSupabaseClient().from("transactions")
    .select("id,invoice_number,created_at,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,status,employees!transactions_cashier_id_fkey(full_name),transaction_items(quantity_in_unit,unit_price,total_amount,product_name_snapshot,unit_name_snapshot)")
    .eq("id",transactionId).maybeSingle();
  if(error) throw mapDatabaseError(error); return data;
}
export async function getCustomerReturns(transactionId:string){const {data,error}=await createAdminSupabaseClient().from("returns").select("id,created_at,reason,refund_total,employees!returns_processed_by_fkey(full_name),return_items(transaction_item_id,quantity_in_base)").eq("transaction_id",transactionId).eq("source","customer").order("created_at",{ascending:false});if(error)throw mapDatabaseError(error);return data??[];}
