import { getExpenses, createExpense } from "@/modules/expenses/application/expense-service";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(request: Request) {
  return executeApi(() => getExpenses(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  return executeApi(async () => createExpense(await request.json()), 201);
}
