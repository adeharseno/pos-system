import { jakartaToday, reportPeriod, validateReportPeriod, type ReportPeriod } from "@/modules/reports/sales-report";
import { hasPermission, type PermissionData } from "@/modules/auth/application/permission-policy";
import type { EmployeeRole } from "@/modules/auth/types";
import type { Permission } from "@/modules/auth/permissions";

export const presets = [
  { value: "today", label: "Hari Ini" }, { value: "week", label: "Minggu Ini" },
  { value: "month", label: "Bulan Ini" }, { value: "custom", label: "Rentang Tanggal" },
] as const;
export type DashboardQuery = { period?: string; from?: string; to?: string; year?: string };
export type DashboardFilters = { preset: typeof presets[number]["value"]; period: ReportPeriod; year: number };

export function dashboardFilters(query: DashboardQuery, now = new Date()): DashboardFilters {
  const preset = presets.find(item => item.value === query.period)?.value ?? "today";
  let period = preset === "custom"
    ? validateReportPeriod({ from: query.from ?? jakartaToday(now), to: query.to ?? jakartaToday(now) })
    : reportPeriod(preset, now);
  // Match /reports' full Monday–Sunday and full calendar-month presets.
  if (preset === "week") {
    const end = new Date(`${period.from}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    period = { from: period.from, to: end.toISOString().slice(0, 10) };
  } else if (preset === "month") {
    const [year, month] = period.from.split("-").map(Number);
    period = { from: period.from, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
  }
  if (Date.parse(period.to) - Date.parse(period.from) > 365 * 86400000) throw new Error("DASHBOARD_PERIOD_TOO_LONG");
  const year = query.year === undefined ? Number(period.to.slice(0, 4)) : Number(query.year);
  if (!Number.isInteger(year) || year < 1900 || year > 9998) throw new Error("INVALID_DASHBOARD_YEAR");
  return { preset, period, year };
}

export function canReadDashboardFinancials(role: EmployeeRole, data: PermissionData) {
  // Financial role boundary is unchanged even if a non-owner has an allow override.
  return role === "owner_admin" && ["reports.sales.view", "reports.products.view", "reports.payments.view"]
    .every(permission => hasPermission(role, permission, data));
}

const actions: Array<{ href: string; label: string; description: string; permission: Permission; roles?: EmployeeRole[] }> = [
  { href: "/cashier", label: "Penjualan Baru", description: "Mulai transaksi penjualan", permission: "cashier.view", roles: ["owner_admin", "kasir"] },
  { href: "/cash-drawer", label: "Kelola Sesi Kasir", description: "Buka dan tutup sesi kasir", permission: "cash_drawer.manage", roles: ["owner_admin", "kasir"] },
  { href: "/inventory/receive", label: "Stok Masuk", description: "Catat penerimaan persediaan", permission: "inventory.receive", roles: ["owner_admin"] },
  { href: "/products", label: "Daftar Barang", description: "Lihat katalog barang apotek", permission: "products.view", roles: ["owner_admin", "kasir"] },
  { href: "/inventory", label: "Persediaan", description: "Periksa ketersediaan barang", permission: "inventory.view", roles: ["owner_admin", "kasir"] },
];
export function dashboardActions(role: EmployeeRole, data: PermissionData) {
  return actions.filter(action => (!action.roles || action.roles.includes(role)) && hasPermission(role, action.permission, data));
}

export async function authorizedDashboardRead<T>(role: EmployeeRole, permissions: PermissionData, read: () => Promise<T>) {
  if (!canReadDashboardFinancials(role, permissions)) throw new Error("FORBIDDEN");
  return read();
}

export function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error("INVALID_REPORT_AMOUNT");
  const amount = BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -amount : amount;
}
export function rupiah(value: bigint): string {
  const absolute = value < BigInt(0) ? -value : value;
  const fraction = absolute % BigInt(100);
  return `${value < BigInt(0) ? "-" : ""}Rp ${(absolute / BigInt(100)).toLocaleString("id-ID")}${fraction ? `,${String(fraction).padStart(2, "0")}` : ""}`;
}
export function dateLabel(date: string, monthOnly = false) {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...(monthOnly ? { month: "short" } : { day: "numeric", month: "short", year: "numeric" }) }).format(new Date(`${date}T00:00:00+07:00`));
}
export type ChartPoint = { label: string; value: number; display: string; count: number };
