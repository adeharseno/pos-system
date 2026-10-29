import { apiFailure, executeApi } from "@/modules/shared/api/response";
import { PurchaseInvoiceError } from "./invoice-errors";
import { PosInputError } from "@/modules/shared/validation/input";

export async function invoiceEndpoint(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof PurchaseInvoiceError) return apiFailure(error.code, error.message, error.status);
    if (error instanceof PosInputError) return apiFailure("INVALID_REQUEST", error.message, 400);
    return executeApi(async () => { throw error; });
  }
}
