import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { Database } from "@/types/database.types";
import type { parseExpenseList } from "../validation";

type ExpenseInsert = Database["public"]["Tables"]["operational_expenses"]["Insert"];
const selection = "id,expense_date,category,description,amount,created_by,created_at";

function present(row: Database["public"]["Tables"]["operational_expenses"]["Row"]) {
  return { ...row, amount: row.amount.toFixed(2) };
}

export async function listExpenses(query: ReturnType<typeof parseExpenseList>) {
  const start = (query.page - 1) * query.pageSize;
  const { data, error, count } = await createAdminSupabaseClient().from("operational_expenses")
    .select(selection, { count: "exact" }).gte("expense_date", query.from).lte("expense_date", query.to)
    .order("expense_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(start, start + query.pageSize - 1);
  if (error) throw mapDatabaseError(error);
  if (count === null) throw new Error("EXPENSE_COUNT_UNAVAILABLE");
  return { items: data.map(present), total: count, page: query.page, pageSize: query.pageSize, from: query.from, to: query.to };
}

export async function insertExpense(input: ExpenseInsert) {
  const { data, error } = await createAdminSupabaseClient().from("operational_expenses").insert(input).select(selection).single();
  if (error) throw mapDatabaseError(error);
  return present(data);
}
