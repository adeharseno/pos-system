import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { HistoryFilters,PaymentMethod,TransactionStatus } from "./transaction-history-filters";
export { historyStatusLabel,parseHistoryFilters } from "./transaction-history-filters";
export type { HistoryFilters,PaymentMethod,TransactionStatus } from "./transaction-history-filters";

function jakartaStart(day:string){return `${day}T00:00:00+07:00`;}
function nextDay(day:string){const value=new Date(`${day}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+1);return value.toISOString().slice(0,10);}
export type HistoryRow={id:string;invoice_number:string;created_at:string;payment_method:PaymentMethod;status:TransactionStatus;total_amount:number;employees:{full_name:string}|null};
export async function listTransactions(filters:HistoryFilters){let query=createAdminSupabaseClient().from("transactions").select("id,invoice_number,created_at,payment_method,status,total_amount,employees!transactions_cashier_id_fkey(full_name)",{count:"exact"}).order("created_at",{ascending:false}).order("id",{ascending:false});if(filters.q)query=query.ilike("invoice_number",`%${filters.q.replace(/[%_]/g,"\\$&")}%`);if(filters.payment)query=query.eq("payment_method",filters.payment);if(filters.status)query=query.eq("status",filters.status);if(filters.from)query=query.gte("created_at",jakartaStart(filters.from));if(filters.to)query=query.lt("created_at",jakartaStart(nextDay(filters.to)));const from=(filters.page-1)*filters.limit;const {data,error,count}=await query.range(from,from+filters.limit-1);if(error)throw mapDatabaseError(error);return{rows:(data??[]) as unknown as HistoryRow[],total:count??0};}
