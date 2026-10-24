import type { EmployeeRole } from "@/modules/auth/types";

/** Central policy for master-data cost and margin visibility. */
export function canViewSensitiveProductPricing(role: EmployeeRole) {
  return role === "owner_admin";
}
