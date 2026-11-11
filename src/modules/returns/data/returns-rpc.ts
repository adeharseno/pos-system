import "server-only";

import { callCoreRpc } from "@/modules/shared/data/core-rpc";
import { requireResultObject, resultNumber, resultString } from "@/modules/shared/data/result";
import type {
  ApproveReturnInput,
  ApproveReturnResult,
  CompleteReturnInput,
  CompleteReturnResult,
  CustomerReturnInput,
  CustomerReturnRequestInput,
  CustomerReturnRequestResult,
  CustomerReturnResult,
  RefundStatus,
  RejectReturnInput,
  RejectReturnResult,
  ReturnStatus,
  SupplierReturnInput,
  SupplierReturnResult,
} from "../types";

export async function createCustomerReturnRpc(input: CustomerReturnInput): Promise<CustomerReturnResult> {
  const data = requireResultObject(
    await callCoreRpc("create_customer_return", {
      p_employee_id: input.employeeId,
      p_transaction_id: input.transactionId,
      p_refund_method: input.refundMethod as "cash" | "qris",
      p_reason: input.reason.trim(),
      p_items: input.items.map((item) => ({
        transaction_item_id: item.transactionItemId,
        quantity_in_base: item.quantityInBase,
      })),
    })
  );
  return {
    returnId: resultString(data, "return_id"),
    refundSubtotal: resultNumber(data, "refund_subtotal"),
    refundTaxAmount: resultNumber(data, "refund_tax_amount"),
    refundTotal: resultNumber(data, "refund_total"),
  };
}

export async function requestCustomerReturnRpc(input: CustomerReturnRequestInput): Promise<CustomerReturnRequestResult> {
  const data = requireResultObject(
    await callCoreRpc("request_customer_return", {
      p_employee_id: input.employeeId,
      p_transaction_id: input.transactionId,
      p_refund_method: input.refundMethod,
      p_reason: input.reason.trim(),
      p_items: input.items.map((item) => ({
        transaction_item_id: item.transactionItemId,
        quantity_in_base: item.quantityInBase,
      })),
    })
  );
  return {
    returnId: resultString(data, "return_id"),
    status: resultString(data, "status") as ReturnStatus,
    refundSubtotal: resultNumber(data, "refund_subtotal"),
    refundTaxAmount: resultNumber(data, "refund_tax_amount"),
    refundTotal: resultNumber(data, "refund_total"),
  };
}

export async function approveCustomerReturnRpc(input: ApproveReturnInput): Promise<ApproveReturnResult> {
  const data = requireResultObject(
    await callCoreRpc("approve_customer_return", {
      p_employee_id: input.employeeId,
      p_return_id: input.returnId,
      p_admin_notes: (input.adminNotes ?? "Disetujui").trim(),
      p_item_conditions: null,
      p_confirm_refund: true,
    })
  );
  const refundTotal = resultNumber(data, "refund_total");
  return {
    returnId: resultString(data, "return_id"),
    returnNumber: resultString(data, "return_number"),
    status: resultString(data, "status") as ReturnStatus,
    refundStatus: resultString(data, "refund_status") as RefundStatus,
    refundTotal,
    receivableCreditAmount:
      typeof data.receivable_credit_amount === "number" ? data.receivable_credit_amount : 0,
    cashRefundAmount:
      typeof data.cash_refund_amount === "number" ? data.cash_refund_amount : refundTotal,
  };
}

export async function rejectCustomerReturnRpc(input: RejectReturnInput): Promise<RejectReturnResult> {
  const data = requireResultObject(
    await callCoreRpc("reject_customer_return", {
      p_employee_id: input.employeeId,
      p_return_id: input.returnId,
      p_admin_notes: input.adminNotes.trim(),
    })
  );
  return {
    returnId: resultString(data, "return_id"),
    status: "rejected",
    adminNotes: resultString(data, "admin_notes"),
  };
}

export async function completeCustomerReturnRpc(input: CompleteReturnInput): Promise<CompleteReturnResult> {
  const data = requireResultObject(
    await callCoreRpc("complete_customer_return", {
      p_employee_id: input.employeeId,
      p_return_id: input.returnId,
      p_item_conditions: input.itemConditions?.map((c) => ({
        return_item_id: c.returnItemId,
        condition: c.condition,
      })),
    })
  );
  return {
    returnId: resultString(data, "return_id"),
    status: "completed",
    refundStatus: "completed",
    refundTotal: resultNumber(data, "refund_total"),
  };
}

export async function createSupplierReturnRpc(input: SupplierReturnInput): Promise<SupplierReturnResult> {
  const data = requireResultObject(
    await callCoreRpc("create_supplier_return", {
      p_employee_id: input.employeeId,
      p_reason: input.reason.trim(),
      p_items: input.items.map((item) => ({
        product_id: item.productId,
        batch_id: item.batchId,
        quantity_in_base: item.quantityInBase,
      })),
    })
  );
  return { returnId: resultString(data, "return_id"), source: "supplier" };
}
