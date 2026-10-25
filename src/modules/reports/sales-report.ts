import { amountCents } from "@/modules/returns/refund-preview";

export type ReportPeriod = { from: string; to: string };
export type ReportSale = { subtotal: number; tax_amount: number };
export type ReportRefund = { refund_subtotal: number; refund_tax_amount: number };
export type ReportAllocation = { quantity_in_base: number; cost_price_snapshot: number };

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateReportPeriod(period: ReportPeriod): ReportPeriod {
  if (!validDate(period.from) || !validDate(period.to) || period.from > period.to) throw new Error("INVALID_REPORT_PERIOD");
  return period;
}
function dayOffset(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function reportPeriod(preset: "today" | "week" | "month", now = new Date()): ReportPeriod {
  const to = jakartaToday(now);
  if (preset === "today") return { from: to, to };
  if (preset === "month") return { from: `${to.slice(0, 7)}-01`, to };
  const weekday = new Date(`${to}T00:00:00Z`).getUTCDay();
  return { from: dayOffset(to, -((weekday + 6) % 7)), to };
}
export function reportDateBounds(period: ReportPeriod) {
  validateReportPeriod(period);
  return { start: `${period.from}T00:00:00+07:00`, endExclusive: `${dayOffset(period.to, 1)}T00:00:00+07:00` };
}
function decimal(cents: bigint): string {
  const sign = cents < BigInt(0) ? "-" : "";
  const absolute = cents < BigInt(0) ? -cents : cents;
  return `${sign}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}
export function calculateSalesReport(sales: ReportSale[], refunds: ReportRefund[], sold: ReportAllocation[], returned: ReportAllocation[]) {
  const sum = <T>(rows: T[], value: (row: T) => bigint) => rows.reduce((total, row) => total + value(row), BigInt(0));
  const revenue = sum(sales, (row) => amountCents(row.subtotal));
  const tax = sum(sales, (row) => amountCents(row.tax_amount));
  const refund = sum(refunds, (row) => amountCents(row.refund_subtotal));
  const refundedTax = sum(refunds, (row) => amountCents(row.refund_tax_amount));
  const cost = (row: ReportAllocation) => {
    if (!Number.isSafeInteger(row.quantity_in_base) || row.quantity_in_base <= 0) throw new Error("INVALID_REPORT_QUANTITY");
    return amountCents(row.cost_price_snapshot) * BigInt(row.quantity_in_base);
  };
  const cogs = sum(sold, cost);
  const returnedCogs = sum(returned, cost);
  const net = revenue - refund;
  const profit = net - (cogs - returnedCogs);
  // Percent is rounded once to two decimal places, using integer arithmetic.
  const margin = net === BigInt(0) ? null : (() => {
    const numerator = profit * BigInt(10000);
    const sign = (numerator < BigInt(0)) !== (net < BigInt(0)) ? "-" : "";
    const absolute = numerator < BigInt(0) ? -numerator : numerator;
    const denominator = net < BigInt(0) ? -net : net;
    const rounded = (absolute * BigInt(2) + denominator) / (BigInt(2) * denominator);
    return `${sign}${rounded / BigInt(100)}.${String(rounded % BigInt(100)).padStart(2, "0")}`;
  })();
  return {
    completedTransactionCount: sales.length, salesRevenue: decimal(revenue), salesTax: decimal(tax),
    refunds: decimal(refund), refundedTax: decimal(refundedTax), netRevenue: decimal(net),
    cogs: decimal(cogs), returnedCogs: decimal(returnedCogs), grossProfit: decimal(profit), grossMarginPercent: margin,
  };
}
