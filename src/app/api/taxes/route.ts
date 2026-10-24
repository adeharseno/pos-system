import { requireRole } from "@/modules/auth/application/auth-service";
import { createTax } from "@/modules/catalog/application/tax-rates";
import { listTaxRates } from "@/modules/catalog/data/tax-rate-repository";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError } from "@/modules/shared/validation/input";

export async function GET() { return executeApi(async () => { await requireRole(["owner_admin"]); return listTaxRates(); }); }
export async function POST(request: Request) { return executeApi(async () => { await requireRole(["owner_admin"]); const body = await request.json() as Record<string, unknown>; const name = typeof body.name === "string" ? body.name.trim() : ""; const rate = Number(body.rate); if (!name || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new PosInputError("Invalid tax"); return createTax(name, rate); }, 201); }
