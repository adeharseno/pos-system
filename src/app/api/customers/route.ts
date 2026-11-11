import { requireRole } from "@/modules/auth/application/auth-service";
import { parseCustomerCreateBody } from "@/modules/customers/customer-input";
import { createCustomer, listCustomers } from "@/modules/customers/data/customer-repository";
import { readJsonObject } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(request: Request) {
  return executeApi(async () => {
    await requireRole(["owner_admin", "kasir"]);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    return listCustomers((params.get("q") ?? "").trim().slice(0, 200), Math.floor(page));
  });
}

export async function POST(request: Request) {
  return executeApi(async () => {
    const employee = await requireRole(["owner_admin", "kasir"]);
    const body = await readJsonObject(request);
    const { requestId, ...input } = parseCustomerCreateBody(body);
    return createCustomer(input, employee.employeeId, requestId);
  }, 201);
}

