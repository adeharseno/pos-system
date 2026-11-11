import "server-only";

import { jakartaToday } from "@/modules/reports/sales-report";
import { callCoreRpc } from "@/modules/shared/data/core-rpc";
import { requireResultObject, resultNumber, resultString } from "@/modules/shared/data/result";
import type { Json } from "@/types/database.types";
import type {
  ReceivableDetail,
  ReceivableDueReminder,
  ReceivableEffectiveStatus,
  ReceivableItemDetail,
  ReceivableListFilters,
  ReceivableListResult,
  ReceivableListRow,
  ReceivablePaymentMethod,
  ReceivablePaymentRecord,
  ReceivablePaymentStatus,
  ReceivableReturnRecord,
  RecordReceivablePaymentInput,
  RecordReceivablePaymentResult,
} from "../receivables-types";

function resultDecimal(obj: Record<string, Json | undefined>, key: string): number {
  const value = obj[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new TypeError(`Invalid RPC decimal field: ${key}`);
}

function optionalString(obj: Record<string, Json | undefined>, key: string): string | null {
  const value = obj[key];
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  throw new TypeError(`Invalid RPC nullable string field: ${key}`);
}

function resultBoolean(obj: Record<string, Json | undefined>, key: string): boolean {
  const value = obj[key];
  if (typeof value !== "boolean") throw new TypeError(`Invalid RPC boolean field: ${key}`);
  return value;
}

function resultArray(obj: Record<string, Json | undefined>, key: string): Array<Record<string, Json | undefined>> {
  const value = obj[key];
  if (!Array.isArray(value)) throw new TypeError(`Invalid RPC array field: ${key}`);
  return value.map((item) => requireResultObject(item));
}

export async function listCustomerReceivablesRpc(
  employeeId: string,
  filters: ReceivableListFilters
): Promise<ReceivableListResult> {
  const data = requireResultObject(
    await callCoreRpc("list_customer_receivables", {
      p_employee_id: employeeId,
      p_today: jakartaToday(),
      p_q: filters.q ?? undefined,
      p_due_from: filters.dueFrom ?? undefined,
      p_due_to: filters.dueTo ?? undefined,
      p_status: filters.status,
      p_sort: filters.sort,
      p_dir: filters.dir,
      p_page: filters.page,
      p_limit: filters.limit,
    })
  );

  const summary = requireResultObject(data.summary ?? null);
  const rows: ReceivableListRow[] = resultArray(data, "rows").map((row) => ({
    id: resultString(row, "id"),
    transactionId: resultString(row, "transaction_id"),
    invoiceNumber: resultString(row, "invoice_number"),
    businessDate: resultString(row, "business_date"),
    transactionCreatedAt: resultString(row, "transaction_created_at"),
    customerId: resultString(row, "customer_id"),
    customerName: resultString(row, "customer_name"),
    customerPhone: optionalString(row, "customer_phone"),
    originalAmount: resultDecimal(row, "original_amount"),
    paidAmount: resultDecimal(row, "paid_amount"),
    creditedReturnAmount: resultDecimal(row, "credited_return_amount"),
    outstandingAmount: resultDecimal(row, "outstanding_amount"),
    dueDate: resultString(row, "due_date"),
    paymentStatus: resultString(row, "payment_status") as ReceivablePaymentStatus,
    effectiveStatus: resultString(row, "effective_status") as ReceivableEffectiveStatus,
    isOverdue: resultBoolean(row, "is_overdue"),
  }));

  return {
    summary: {
      totalActiveOutstanding: resultDecimal(summary, "total_active_outstanding"),
      unpaidInvoiceCount: resultNumber(summary, "unpaid_invoice_count"),
      dueSoonCount: resultNumber(summary, "due_soon_count"),
      overdueOutstanding: resultDecimal(summary, "overdue_outstanding"),
      overdueCount: resultNumber(summary, "overdue_count"),
    },
    page: resultNumber(data, "page"),
    limit: resultNumber(data, "limit"),
    total: resultNumber(data, "total"),
    rows,
  };
}

export async function getCustomerReceivableDetailRpc(
  employeeId: string,
  receivableId: string
): Promise<ReceivableDetail> {
  const data = requireResultObject(
    await callCoreRpc("get_customer_receivable_detail", {
      p_employee_id: employeeId,
      p_receivable_id: receivableId,
      p_today: jakartaToday(),
    })
  );

  const customer = requireResultObject(data.customer ?? null);
  const items: ReceivableItemDetail[] = resultArray(data, "items").map((item) => ({
    id: resultString(item, "id"),
    productName: resultString(item, "product_name"),
    unitName: resultString(item, "unit_name"),
    quantityInUnit: resultNumber(item, "quantity_in_unit"),
    unitPrice: resultDecimal(item, "unit_price"),
    subtotal: resultDecimal(item, "subtotal"),
    taxAmount: resultDecimal(item, "tax_amount"),
    totalAmount: resultDecimal(item, "total_amount"),
  }));

  const payments: ReceivablePaymentRecord[] = resultArray(data, "payments").map((payment) => ({
    id: resultString(payment, "id"),
    paymentDate: resultString(payment, "payment_date"),
    paymentMethod: resultString(payment, "payment_method") as ReceivablePaymentMethod,
    amount: resultDecimal(payment, "amount"),
    reference: optionalString(payment, "reference"),
    notes: optionalString(payment, "notes"),
    recordedByName: resultString(payment, "recorded_by_name"),
    createdAt: resultString(payment, "created_at"),
  }));

  const returns: ReceivableReturnRecord[] = resultArray(data, "returns").map((ret) => ({
    id: resultString(ret, "id"),
    returnNumber: optionalString(ret, "return_number"),
    status: resultString(ret, "status"),
    refundMethod: resultString(ret, "refund_method"),
    refundTotal: resultDecimal(ret, "refund_total"),
    receivableCreditAmount: resultDecimal(ret, "receivable_credit_amount"),
    cashRefundAmount: resultDecimal(ret, "cash_refund_amount"),
    reason: resultString(ret, "reason"),
    createdAt: resultString(ret, "created_at"),
  }));

  return {
    id: resultString(data, "id"),
    transactionId: resultString(data, "transaction_id"),
    invoiceNumber: resultString(data, "invoice_number"),
    businessDate: resultString(data, "business_date"),
    transactionCreatedAt: resultString(data, "transaction_created_at"),
    cashierName: resultString(data, "cashier_name"),
    subtotal: resultDecimal(data, "subtotal"),
    taxAmount: resultDecimal(data, "tax_amount"),
    totalAmount: resultDecimal(data, "total_amount"),
    customer: {
      id: resultString(customer, "id"),
      name: resultString(customer, "name"),
      phone: optionalString(customer, "phone"),
      address: optionalString(customer, "address"),
      notes: optionalString(customer, "notes"),
    },
    originalAmount: resultDecimal(data, "original_amount"),
    paidAmount: resultDecimal(data, "paid_amount"),
    creditedReturnAmount: resultDecimal(data, "credited_return_amount"),
    outstandingAmount: resultDecimal(data, "outstanding_amount"),
    dueDate: resultString(data, "due_date"),
    paymentStatus: resultString(data, "payment_status") as ReceivablePaymentStatus,
    effectiveStatus: resultString(data, "effective_status") as ReceivableEffectiveStatus,
    isOverdue: resultBoolean(data, "is_overdue"),
    items,
    payments,
    returns,
  };
}

export async function recordCustomerReceivablePaymentRpc(
  input: RecordReceivablePaymentInput
): Promise<RecordReceivablePaymentResult> {
  const data = requireResultObject(
    await callCoreRpc("record_customer_receivable_payment", {
      p_request_id: input.requestId,
      p_employee_id: input.employeeId,
      p_receivable_id: input.receivableId,
      p_payment_method: input.paymentMethod,
      p_amount: input.amount,
      p_payment_date: input.paymentDate,
      p_reference: input.reference ?? undefined,
      p_notes: input.notes ?? undefined,
    })
  );

  return {
    paymentId: resultString(data, "payment_id"),
    receivableId: resultString(data, "receivable_id"),
    transactionId: resultString(data, "transaction_id"),
    customerId: resultString(data, "customer_id"),
    amount: resultDecimal(data, "amount"),
    paymentMethod: resultString(data, "payment_method") as ReceivablePaymentMethod,
    paymentDate: resultString(data, "payment_date"),
    reference: optionalString(data, "reference"),
    notes: optionalString(data, "notes"),
    paidAmount: resultDecimal(data, "paid_amount"),
    creditedReturnAmount: resultDecimal(data, "credited_return_amount"),
    outstandingAmount: resultDecimal(data, "outstanding_amount"),
    paymentStatus: resultString(data, "payment_status") as ReceivablePaymentStatus,
    replayed: resultBoolean(data, "replayed"),
  };
}

export async function getReceivableDueRemindersRpc(): Promise<ReceivableDueReminder[]> {
  const raw = await callCoreRpc("customer_receivable_due_reminders", { p_today: jakartaToday() });
  if (!Array.isArray(raw)) throw new TypeError("Invalid due reminders RPC result");
  return raw.map((item) => {
    const obj = requireResultObject(item);
    return {
      id: resultString(obj, "id"),
      invoiceNumber: resultString(obj, "invoiceNumber"),
      customerName: resultString(obj, "customerName"),
      dueDate: resultString(obj, "dueDate"),
      outstanding: resultDecimal(obj, "outstanding"),
      daysRemaining: resultNumber(obj, "daysRemaining"),
    };
  });
}
