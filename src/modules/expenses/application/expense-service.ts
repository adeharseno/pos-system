import "server-only";

import { requireRole } from "@/modules/auth/application/auth-service";
import { insertExpense, listExpenses } from "../data/expense-repository";
import { parseExpense, parseExpenseList } from "../validation";

export async function getExpenses(params: URLSearchParams) {
  await requireRole(["owner_admin"]);
  return listExpenses(parseExpenseList(params));
}

export async function createExpense(input: unknown) {
  const employee = await requireRole(["owner_admin"]);
  return insertExpense({ ...parseExpense(input), created_by: employee.employeeId });
}
