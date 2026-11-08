import type { CoreRpcArgs } from "@/modules/shared/data/core-rpc";
import { DEFAULT_PRESCRIPTION_CATEGORY, type CheckoutInput } from "./types";

export function toCheckoutRpcArgs(input: CheckoutInput): CoreRpcArgs<"checkout_transaction_idempotent"> {
  return {
    p_request_id: input.requestId,
    p_employee_id: input.employeeId,
    p_payment_method: input.paymentMethod,
    p_items: input.items.map((item) => ({ product_unit_id: item.productUnitId, quantity: item.quantity })),
    p_cash_received: input.cashReceived,
    p_prescription: {
      prescription_category: input.prescription?.category ?? DEFAULT_PRESCRIPTION_CATEGORY,
      prescription_number: input.prescription?.prescriptionNumber,
      patient_name: input.prescription?.patientName,
      bpjs_number: input.prescription?.bpjsNumber,
      prescription_origin: input.prescription?.prescriptionOrigin,
      prescription_date: input.prescription?.prescriptionDate,
    },
  };
}
