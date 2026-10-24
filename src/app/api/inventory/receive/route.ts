import { requireRole } from "@/modules/auth/application/auth-service";
import { receiveStock, type ReceiveStockBatch } from "@/modules/inventory/application/receive-stock";
import { executeApi } from "@/modules/shared/api/response";
import { PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import { PosInputError, requireUuid } from "@/modules/shared/validation/input";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => { const date = new Date(`${value}T00:00:00Z`); return datePattern.test(value) && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; };
const text = (body: Record<string, unknown>, key: string) => typeof body[key] === "string" ? body[key].trim() : "";

function batchFromBody(value: unknown): ReceiveStockBatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosInputError("Invalid batch");
  const body = value as Record<string, unknown>;
  const batchNumber = text(body, "batch_number");
  if (!batchNumber) throw new PosInputError("Invalid batch number");
  const quantity = typeof body.quantity === "number" ? body.quantity : Number.NaN;
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new PosDomainError("INVALID_QUANTITY");
  const costPrice = typeof body.cost_price === "number" ? body.cost_price : Number.NaN;
  if (!Number.isFinite(costPrice) || costPrice < 0) throw new PosDomainError("INVALID_COST");
  const expiredDate = text(body, "expired_date");
  if (!validDate(expiredDate)) throw new PosDomainError("INVALID_EXPIRY");
  const receivedDate = body.received_date === undefined || body.received_date === null ? undefined : text(body, "received_date");
  if (receivedDate !== undefined && !validDate(receivedDate)) throw new PosDomainError("INVALID_EXPIRY");
  return { batchNumber, expiredDate, quantity, costPrice, ...(receivedDate ? { receivedDate } : {}) };
}

export async function POST(request: Request) {
  return executeApi(async () => {
    const employee = await requireRole(["owner_admin"]);
    const body = await request.json() as Record<string, unknown>;
    if (!Array.isArray(body.batches) || body.batches.length === 0) throw new PosInputError("Batches are required");
    const productId = requireUuid(text(body, "product_id"), "product_id");
    return receiveStock({ employeeId: employee.employeeId, productId, batches: body.batches.map(batchFromBody) });
  }, 201);
}
