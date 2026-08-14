import type { CoreRpcArgs } from "@/modules/shared/data/core-rpc";
import type { CheckoutInput } from "./types";

export function toCheckoutRpcArgs(input: CheckoutInput): CoreRpcArgs<"checkout_transaction"> {
  return {
    p_employee_id: input.employeeId,
    p_cash_drawer_session_id: input.cashDrawerSessionId,
    p_payment_method: input.paymentMethod,
    p_items: input.items.map((item) => ({ product_unit_id: item.productUnitId, quantity: item.quantity })),
    p_cash_received: input.cashReceived,
    p_prescription: input.prescription ? {
      prescription_number: input.prescription.prescriptionNumber,
      doctor_name: input.prescription.doctorName,
      patient_name: input.prescription.patientName,
      photo_url: input.prescription.photoUrl,
    } : undefined,
  };
}
