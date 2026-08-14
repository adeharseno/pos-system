import "server-only";

import { callCoreRpc } from "@/modules/shared/data/core-rpc";
import { requireResultObject, resultNumber, resultString } from "@/modules/shared/data/result";
import type { CustomerReturnInput, CustomerReturnResult, SupplierReturnInput, SupplierReturnResult } from "../types";

export async function createCustomerReturnRpc(input: CustomerReturnInput): Promise<CustomerReturnResult> {
  const data=requireResultObject(await callCoreRpc("create_customer_return", {
    p_employee_id:input.employeeId,p_transaction_id:input.transactionId,p_refund_method:input.refundMethod,
    p_cash_drawer_session_id:input.cashDrawerSessionId ?? null,p_reason:input.reason.trim(),
    p_items:input.items.map((item)=>({transaction_item_id:item.transactionItemId,quantity_in_base:item.quantityInBase})),
  }));
  return {returnId:resultString(data,"return_id"),refundSubtotal:resultNumber(data,"refund_subtotal"),refundTaxAmount:resultNumber(data,"refund_tax_amount"),refundTotal:resultNumber(data,"refund_total")};
}

export async function createSupplierReturnRpc(input: SupplierReturnInput): Promise<SupplierReturnResult> {
  const data=requireResultObject(await callCoreRpc("create_supplier_return", {p_employee_id:input.employeeId,p_reason:input.reason.trim(),p_items:input.items.map((item)=>({product_id:item.productId,batch_id:item.batchId,quantity_in_base:item.quantityInBase}))}));
  return {returnId:resultString(data,"return_id"),source:"supplier"};
}
