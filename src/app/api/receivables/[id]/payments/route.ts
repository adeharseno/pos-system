import { requireRole } from "@/modules/auth/application/auth-service";
import { recordReceivablePaymentForOwner } from "@/modules/receivables/application/receivables-service";
import type { ReceivablePaymentMethod } from "@/modules/receivables/receivables-types";
import { optionalStringField, readJsonObject, stringField } from "@/modules/shared/api/input";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError } from "@/modules/shared/validation/input";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const { id } = await params;
    const body = await readJsonObject(request);
    const requestId = stringField(body, "request_id");
    const methodRaw = stringField(body, "payment_method");
    if (methodRaw !== "cash" && methodRaw !== "qris" && methodRaw !== "bank_transfer") {
      throw new PosInputError("payment_method invalid");
    }
    const rawAmount = body.amount;
    const amount =
      typeof rawAmount === "number"
        ? rawAmount
        : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount)
        : Number.NaN;
    if (!Number.isFinite(amount)) {
      throw new PosInputError("amount must be a finite number");
    }

    const paymentDate = stringField(body, "payment_date");
    const reference = optionalStringField(body, "reference") ?? null;
    const notes = optionalStringField(body, "notes") ?? null;

    return recordReceivablePaymentForOwner({
      requestId,
      receivableId: id,
      paymentMethod: methodRaw as ReceivablePaymentMethod,
      amount,
      paymentDate,
      reference,
      notes,
    });
  }, 201);
}

