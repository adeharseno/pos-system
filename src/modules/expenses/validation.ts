import { jakartaToday, validateReportPeriod } from "@/modules/reports/sales-report";
import { PosInputError } from "@/modules/shared/validation/input";

function date(value: string): string {
  try { validateReportPeriod({ from: value, to: value }); return value; }
  catch { throw new PosInputError("Invalid expense date"); }
}

export function parseExpense(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PosInputError("Invalid expense");
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["expense_date", "category", "description", "amount"].includes(key))) throw new PosInputError("Unexpected expense field");
  const expenseDate = body.expense_date === undefined ? jakartaToday() : typeof body.expense_date === "string" ? date(body.expense_date) : "";
  if (!expenseDate) throw new PosInputError("Invalid expense date");
  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!category) throw new PosInputError("Category required");
  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") throw new PosInputError("Invalid description");
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  // Accept decimal text only so JSON parsing cannot silently round the input.
  if (typeof body.amount !== "string" || !/^\d{1,12}(?:\.\d{1,2})?$/.test(body.amount)) throw new PosInputError("Invalid amount");
  const [whole, fraction = ""] = body.amount.split(".");
  const normalized = `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
  const amount = Number(normalized);
  if (amount <= 0 || amount.toFixed(2) !== normalized) throw new PosInputError("Invalid amount");
  return { expense_date: expenseDate, category, description, amount };
}

export function parseExpenseList(params: URLSearchParams) {
  const from = params.get("from") ?? jakartaToday();
  const to = params.get("to") ?? jakartaToday();
  date(from); date(to);
  if (from > to) throw new PosInputError("Invalid expense period");
  const readInteger = (key: string, fallback: number, max: number) => {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^[1-9]\d*$/.test(value)) throw new PosInputError(`Invalid ${key}`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > max) throw new PosInputError(`Invalid ${key}`);
    return parsed;
  };
  return { from, to, page: readInteger("page", 1, 1_000_000), pageSize: readInteger("page_size", 20, 100) };
}
