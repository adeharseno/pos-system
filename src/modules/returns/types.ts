export interface CustomerReturnItemInput { transactionItemId: string; quantityInBase: number }
export interface CustomerReturnInput {
  employeeId: string;
  transactionId: string;
  refundMethod: "cash" | "qris";
  cashDrawerSessionId?: string;
  reason: string;
  items: CustomerReturnItemInput[];
}
export interface SupplierReturnItemInput { productId: string; batchId: string; quantityInBase: number }
export interface SupplierReturnInput { employeeId: string; reason: string; items: SupplierReturnItemInput[] }
export interface CustomerReturnResult { returnId: string; refundSubtotal: number; refundTaxAmount: number; refundTotal: number }
export interface SupplierReturnResult { returnId: string; source: "supplier" }
