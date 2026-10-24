import { requireRole } from "@/modules/auth/application/auth-service";
import { editTax, setTaxActive } from "@/modules/catalog/application/tax-rates";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError, requireUuid } from "@/modules/shared/validation/input";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return executeApi(async () => { await requireRole(["owner_admin"]); const { id } = await params; const body = await request.json() as Record<string, unknown>; const taxId = requireUuid(id, "taxId"); if ("is_active" in body) { if (typeof body.is_active !== "boolean") throw new PosInputError("Invalid status"); return setTaxActive(taxId, body.is_active); } const name = typeof body.name === "string" ? body.name.trim() : ""; const rate = Number(body.rate); if (!name || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new PosInputError("Invalid tax"); return editTax(taxId, name, rate); }); }
