import "server-only";

import { createCustomerReturnRpc, createSupplierReturnRpc } from "../data/returns-rpc";
import { validateCustomerReturn, validateSupplierReturn } from "../schemas";
import type { CustomerReturnInput, SupplierReturnInput } from "../types";

export const createCustomerReturn = (input: CustomerReturnInput) => createCustomerReturnRpc(validateCustomerReturn(input));
export const createSupplierReturn = (input: SupplierReturnInput) => createSupplierReturnRpc(validateSupplierReturn(input));
