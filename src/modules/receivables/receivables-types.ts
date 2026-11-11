export type ReceivablePaymentStatus = "unpaid" | "partial" | "paid";
export type ReceivableEffectiveStatus = "unpaid" | "partial" | "paid" | "overdue";
export type ReceivableStatusFilter = "all" | ReceivableEffectiveStatus | "active";
export type ReceivablePaymentMethod = "cash" | "qris" | "bank_transfer";

export type ReceivableSortColumn =
  | "due_date"
  | "transaction_date"
  | "invoice_number"
  | "customer_name"
  | "original_amount"
  | "paid_amount"
  | "outstanding_amount"
  | "status";

export type SortDirection = "asc" | "desc";

export interface ReceivableListFilters {
  q?: string;
  dueFrom?: string;
  dueTo?: string;
  status: ReceivableStatusFilter;
  sort: ReceivableSortColumn;
  dir: SortDirection;
  page: number;
  limit: number;
}

export interface ReceivablesSummary {
  totalActiveOutstanding: number;
  unpaidInvoiceCount: number;
  dueSoonCount: number;
  overdueOutstanding: number;
  overdueCount: number;
}

export interface ReceivableListRow {
  id: string;
  transactionId: string;
  invoiceNumber: string;
  businessDate: string;
  transactionCreatedAt: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  originalAmount: number;
  paidAmount: number;
  creditedReturnAmount: number;
  outstandingAmount: number;
  dueDate: string;
  paymentStatus: ReceivablePaymentStatus;
  effectiveStatus: ReceivableEffectiveStatus;
  isOverdue: boolean;
}

export interface ReceivableListResult {
  summary: ReceivablesSummary;
  page: number;
  limit: number;
  total: number;
  rows: ReceivableListRow[];
}

export interface ReceivableItemDetail {
  id: string;
  productName: string;
  unitName: string;
  quantityInUnit: number;
  unitPrice: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

export interface ReceivablePaymentRecord {
  id: string;
  paymentDate: string;
  paymentMethod: ReceivablePaymentMethod;
  amount: number;
  reference: string | null;
  notes: string | null;
  recordedByName: string;
  createdAt: string;
}

export interface ReceivableReturnRecord {
  id: string;
  returnNumber: string | null;
  status: string;
  refundMethod: string;
  refundTotal: number;
  receivableCreditAmount: number;
  cashRefundAmount: number;
  reason: string;
  createdAt: string;
}

export interface ReceivableDetail {
  id: string;
  transactionId: string;
  invoiceNumber: string;
  businessDate: string;
  transactionCreatedAt: string;
  cashierName: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
  };
  originalAmount: number;
  paidAmount: number;
  creditedReturnAmount: number;
  outstandingAmount: number;
  dueDate: string;
  paymentStatus: ReceivablePaymentStatus;
  effectiveStatus: ReceivableEffectiveStatus;
  isOverdue: boolean;
  items: ReceivableItemDetail[];
  payments: ReceivablePaymentRecord[];
  returns: ReceivableReturnRecord[];
}

export interface RecordReceivablePaymentInput {
  requestId: string;
  employeeId: string;
  receivableId: string;
  paymentMethod: ReceivablePaymentMethod;
  amount: number;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
}

export interface RecordReceivablePaymentResult {
  paymentId: string;
  receivableId: string;
  transactionId: string;
  customerId: string;
  amount: number;
  paymentMethod: ReceivablePaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  paidAmount: number;
  creditedReturnAmount: number;
  outstandingAmount: number;
  paymentStatus: ReceivablePaymentStatus;
  replayed: boolean;
}

export interface ReceivableDueReminder {
  id: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
  outstanding: number;
  daysRemaining: number;
}

