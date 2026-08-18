import { requireNonNegativeMoney,requireUuid } from "@/modules/shared/validation/input";
import type { CloseCashDrawerInput,OpenCashDrawerInput } from "./types";
export function validateOpenCashDrawer(input:OpenCashDrawerInput){requireUuid(input.employeeId,"employeeId");requireNonNegativeMoney(input.openingBalance,"openingBalance");return input;}
export function validateCloseCashDrawer(input:CloseCashDrawerInput){requireUuid(input.employeeId,"employeeId");requireUuid(input.sessionId,"sessionId");requireNonNegativeMoney(input.actualClosingCash,"actualClosingCash");return input;}
