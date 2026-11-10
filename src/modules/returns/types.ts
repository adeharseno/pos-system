export type ReturnStatus = "pending_approval" | "approved" | "rejected" | "completed";
export type RefundStatus = "pending" | "completed";
export type ItemCondition = "good" | "damaged" | "expired";

export interface CustomerReturnItemInput { transactionItemId: string; quantityInBase: number }
export interface CustomerReturnInput {
  employeeId: string;
  transactionId: string;
  refundMethod: "cash" | "qris" | "bank_transfer" | "bpjs";
  reason: string;
  items: CustomerReturnItemInput[];
}

export interface CustomerReturnRequestInput extends CustomerReturnInput {}
export interface CustomerReturnRequestResult {
  returnId: string;
  status: ReturnStatus;
  refundSubtotal: number;
  refundTaxAmount: number;
  refundTotal: number;
}

export interface ApproveReturnInput {
  employeeId: string;
  returnId: string;
  adminNotes: string;
  itemConditions?: Array<{ returnItemId: string; condition: ItemCondition }>;
  confirmRefund?: boolean;
}

export interface ApproveReturnResult {
  returnId: string;
  returnNumber: string;
  status: ReturnStatus;
  refundStatus: RefundStatus;
  refundTotal: number;
}

export interface RejectReturnInput {
  employeeId: string;
  returnId: string;
  adminNotes: string;
}

export interface RejectReturnResult {
  returnId: string;
  status: "rejected";
  adminNotes: string;
}

export interface CompleteReturnInput {
  employeeId: string;
  returnId: string;
  itemConditions?: Array<{ returnItemId: string; condition: ItemCondition }>;
}

export interface CompleteReturnResult {
  returnId: string;
  status: "completed";
  refundStatus: "completed";
  refundTotal: number;
}

export interface ReturnDetailItem {
  id: string;
  productId: string;
  productName: string;
  unitName: string;
  quantityInBase: number;
  conversionToBase: number;
  quantityInUnit: number;
  unitPrice: number;
  refundSubtotal: number;
  refundTaxAmount: number;
  refundTotal: number;
  condition: ItemCondition;
  isRestocked: boolean;
}

export interface ReturnDetail {
  id: string;
  returnNumber: string | null;
  createdAt: string;
  status: ReturnStatus;
  refundStatus: RefundStatus;
  refundMethod: string;
  refundSubtotal: number;
  refundTaxAmount: number;
  refundTotal: number;
  reason: string;
  adminNotes: string | null;
  transactionId: string;
  invoiceNumber: string;
  transactionDate: string;
  transactionPaymentMethod: string;
  cashierName: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  refundConfirmedAt: string | null;
  items: ReturnDetailItem[];
}

export interface SupplierReturnItemInput { productId: string; batchId: string; quantityInBase: number }
export interface SupplierReturnInput { employeeId: string; reason: string; items: SupplierReturnItemInput[] }
export interface CustomerReturnResult { returnId: string; refundSubtotal: number; refundTaxAmount: number; refundTotal: number }
export interface SupplierReturnResult { returnId: string; source: "supplier" }
