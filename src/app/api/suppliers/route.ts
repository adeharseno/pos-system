import { requireRole } from "@/modules/auth/application/auth-service";
import { listSuppliers, saveSupplier } from "@/modules/catalog/data/supplier-repository";
import { parseSupplierInput } from "@/modules/catalog/supplier-input";
import { executeApi } from "@/modules/shared/api/response";
export async function GET(request: Request) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    return listSuppliers((params.get("q") ?? "").trim().slice(0, 200), Math.floor(page));
  });
}
export async function POST(request: Request) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    return saveSupplier(parseSupplierInput(await request.json()));
  }, 201);
}
