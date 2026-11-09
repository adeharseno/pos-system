import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { HistoryFilters, PaymentMethod, TransactionStatus } from "./transaction-history-filters";

export { historyStatusLabel, jakartaToday, parseHistoryFilters, resolveTransactionDisplayStatus } from "./transaction-history-filters";
export type { HistoryFilters, PaymentMethod, TransactionStatus } from "./transaction-history-filters";

function jakartaStart(day: string) {
  return `${day}T00:00:00+07:00`;
}

function nextDay(day: string) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export type HistoryRow = {
  id: string;
  invoice_number: string;
  created_at: string;
  payment_method: PaymentMethod;
  status: TransactionStatus;
  total_amount: number;
  employees: { full_name: string } | null;
};

export type TransactionCashier = { id: string; name: string };

export type DailySalesTotalRow = {
  business_date: string;
  cashier_id: string;
  cashier_name: string;
  payment_method: PaymentMethod;
  sale_count: number;
  gross_total: number;
  completed_total: number;
  voided_total: number;
};

export async function listTransactions(filters: HistoryFilters) {
  let query = createAdminSupabaseClient()
    .from("transaction_history_view")
    .select(
      "id,invoice_number,created_at,payment_method,status,total_amount,cashier_id,cashier_name",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (filters.q) query = query.ilike("invoice_number", `%${filters.q.replace(/[%_]/g, "\\$&")}%`);
  if (filters.payment) query = query.eq("payment_method", filters.payment);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.cashierId) query = query.eq("cashier_id", filters.cashierId);
  if (filters.from) query = query.gte("created_at", jakartaStart(filters.from));
  if (filters.to) query = query.lt("created_at", jakartaStart(nextDay(filters.to)));
  const from = (filters.page - 1) * filters.limit;
  const { data, error, count } = await query.range(from, from + filters.limit - 1);
  if (error) throw mapDatabaseError(error);
  const rows: HistoryRow[] = (data ?? []).map((row) => ({
    id: row.id ?? "",
    invoice_number: row.invoice_number ?? "",
    created_at: row.created_at ?? "",
    payment_method: row.payment_method as PaymentMethod,
    status: (row.status ?? "completed") as TransactionStatus,
    total_amount: Number(row.total_amount ?? 0),
    employees: row.cashier_name ? { full_name: row.cashier_name } : null,
  }));
  return { rows, total: count ?? 0 };
}

/** Cashier options come from the employee master so older transactions remain filterable. */
export async function listTransactionCashiers(): Promise<TransactionCashier[]> {
  const { data, error } = await createAdminSupabaseClient()
    .from("employees")
    .select("id,full_name")
    .in("position", ["owner_admin", "kasir"])
    .order("full_name");
  if (error) throw mapDatabaseError(error);
  return (data ?? []).map((row) => ({ id: row.id, name: row.full_name }));
}

/**
 * Daily recap is meaningful only for an explicit date range. It follows the
 * same cashier and payment filters as the transaction list; the status filter
 * intentionally affects only the list.
 */
export async function listDailySalesTotals(filters: HistoryFilters): Promise<DailySalesTotalRow[]> {
  if (!filters.from || !filters.to) return [];
  let query = createAdminSupabaseClient()
    .from("daily_sales_totals")
    .select(
      "business_date,cashier_id,cashier_name,payment_method,sale_count,gross_total,completed_total,voided_total",
    )
    .gte("business_date", filters.from)
    .lte("business_date", filters.to)
    .order("business_date")
    .order("cashier_name")
    .order("payment_method");
  if (filters.cashierId) query = query.eq("cashier_id", filters.cashierId);
  if (filters.payment) query = query.eq("payment_method", filters.payment);
  const { data, error } = await query;
  if (error) throw mapDatabaseError(error);
  return (data ?? []) as DailySalesTotalRow[];
}
