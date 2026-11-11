import "server-only";

import { requireRole } from "@/modules/auth/application/auth-service";
import { requireUuid } from "@/modules/shared/validation/input";
import { validateRecordReceivablePayment } from "../receivables-validation";
import type {
  ReceivableDetail,
  ReceivableDueReminder,
  ReceivableListFilters,
  ReceivableListResult,
  ReceivablePaymentMethod,
  RecordReceivablePaymentResult,
} from "../receivables-types";
import {
  getCustomerReceivableDetailRpc,
  getReceivableDueRemindersRpc,
  listCustomerReceivablesRpc,
  recordCustomerReceivablePaymentRpc,
} from "../data/receivables-repository";

export async function listReceivablesForOwner(
  filters: ReceivableListFilters
): Promise<ReceivableListResult> {
  const employee = await requireRole(["owner_admin"]);
  return listCustomerReceivablesRpc(employee.employeeId, filters);
}

export async function getReceivableDetailForOwner(receivableId: string): Promise<ReceivableDetail> {
  const employee = await requireRole(["owner_admin"]);
  const validId = requireUuid(receivableId, "receivableId");
  return getCustomerReceivableDetailRpc(employee.employeeId, validId);
}

export async function recordReceivablePaymentForOwner(params: {
  requestId: string;
  receivableId: string;
  paymentMethod: ReceivablePaymentMethod;
  amount: number;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
}): Promise<RecordReceivablePaymentResult> {
  const employee = await requireRole(["owner_admin"]);
  const validated = validateRecordReceivablePayment({
    ...params,
    employeeId: employee.employeeId,
  });
  return recordCustomerReceivablePaymentRpc(validated);
}

export async function getReceivableDueRemindersForOwner(): Promise<ReceivableDueReminder[]> {
  await requireRole(["owner_admin"]);
  return getReceivableDueRemindersRpc();
}

