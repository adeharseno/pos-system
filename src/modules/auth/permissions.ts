/** Known capabilities only. Adding a definition never grants it to a preset. */
export const PERMISSIONS = [
  "dashboard.view", "products.view", "products.create", "products.edit", "products.delete",
  "products.activate", "products.units.manage", "products.import", "catalog.manage",
  "pricing.cost.view", "pricing.cost.edit", "pricing.margin.view", "pricing.selling.view", "pricing.selling.edit",
  "inventory.view", "inventory.receive", "inventory.opname",
  "cashier.view", "sales.checkout", "transactions.view", "transactions.void", "transactions.confirm_payment",
  "returns.view", "returns.create", "returns.supplier", "cash_drawer.manage",
  "reports.sales.view", "reports.products.view", "reports.payments.view", "reports.profit.view", "expenses.manage",
  "employees.view", "employees.create", "employees.edit", "employees.deactivate", "employees.invite",
  "permissions.manage", "audit.view",
  "submissions.view_own", "submissions.create", "submissions.edit_own", "submissions.submit",
  "submissions.review", "submissions.approve", "submissions.reject", "submissions.request_revision",
] as const;

export type Permission = typeof PERMISSIONS[number];
export type PermissionOverride = { permission: string; effect: "allow" | "deny" };
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
