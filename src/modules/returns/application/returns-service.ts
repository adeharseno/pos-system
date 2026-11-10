import "server-only";

import {
  approveCustomerReturnRpc,
  completeCustomerReturnRpc,
  createCustomerReturnRpc,
  createSupplierReturnRpc,
  rejectCustomerReturnRpc,
  requestCustomerReturnRpc,
} from "../data/returns-rpc";
import {
  validateApproveReturn,
  validateCompleteReturn,
  validateCustomerReturn,
  validateCustomerReturnRequest,
  validateRejectReturn,
  validateSupplierReturn,
} from "../schemas";
import type {
  ApproveReturnInput,
  CompleteReturnInput,
  CustomerReturnInput,
  CustomerReturnRequestInput,
  RejectReturnInput,
  SupplierReturnInput,
} from "../types";

export const createCustomerReturn = (input: CustomerReturnInput) =>
  createCustomerReturnRpc(validateCustomerReturn(input));

export const requestCustomerReturn = (input: CustomerReturnRequestInput) =>
  requestCustomerReturnRpc(validateCustomerReturnRequest(input));

export const approveCustomerReturn = (input: ApproveReturnInput) =>
  approveCustomerReturnRpc(validateApproveReturn(input));

export const rejectCustomerReturn = (input: RejectReturnInput) =>
  rejectCustomerReturnRpc(validateRejectReturn(input));

export const completeCustomerReturn = (input: CompleteReturnInput) =>
  completeCustomerReturnRpc(validateCompleteReturn(input));

export const createSupplierReturn = (input: SupplierReturnInput) =>
  createSupplierReturnRpc(validateSupplierReturn(input));
