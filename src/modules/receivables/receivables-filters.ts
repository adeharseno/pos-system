import type {
  ReceivableEffectiveStatus,
  ReceivableListFilters,
  ReceivablePaymentMethod,
  ReceivableSortColumn,
  ReceivableStatusFilter,
  SortDirection,
} from "./receivables-types";

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const VALID_STATUSES = new Set<ReceivableStatusFilter>([
  "all",
  "unpaid",
  "partial",
  "paid",
  "overdue",
  "active",
]);

const VALID_SORTS = new Set<ReceivableSortColumn>([
  "due_date",
  "transaction_date",
  "invoice_number",
  "customer_name",
  "original_amount",
  "paid_amount",
  "outstanding_amount",
  "status",
]);

function normalizeYmd(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!YMD_PATTERN.test(trimmed)) return undefined;
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== trimmed) {
    return undefined;
  }
  return trimmed;
}

/** Parse and sanitize URL query parameters for the Piutang list view. */
export function parseReceivableListFilters(
  query: Record<string, string | undefined>
): ReceivableListFilters {
  const qRaw = query.q?.trim();
  const q = qRaw ? qRaw.slice(0, 80) : undefined;
  const dueFrom = normalizeYmd(query.due_from);
  const dueTo = normalizeYmd(query.due_to);
  const statusCandidate = query.status?.trim() as ReceivableStatusFilter | undefined;
  const status: ReceivableStatusFilter =
    statusCandidate && VALID_STATUSES.has(statusCandidate) ? statusCandidate : "all";
  const sortCandidate = query.sort?.trim() as ReceivableSortColumn | undefined;
  const sort: ReceivableSortColumn =
    sortCandidate && VALID_SORTS.has(sortCandidate) ? sortCandidate : "due_date";
  const dir: SortDirection = query.dir === "desc" ? "desc" : "asc";
  const rawPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawLimit = Number.parseInt(query.limit ?? "20", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 20;

  return { q, dueFrom, dueTo, status, sort, dir, page, limit };
}

/** Map dynamic receivable status to its Indonesian display label and badge colors. */
export function receivableStatusPresentation(status: ReceivableEffectiveStatus): {
  label: string;
  badgeClassName: string;
} {
  switch (status) {
    case "paid":
      return {
        label: "Lunas",
        badgeClassName: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    case "partial":
      return {
        label: "Sebagian",
        badgeClassName: "bg-blue-100 text-blue-800 border-blue-200",
      };
    case "overdue":
      return {
        label: "Terlambat",
        badgeClassName: "bg-red-100 text-red-800 border-red-200",
      };
    case "unpaid":
    default:
      return {
        label: "Belum Lunas",
        badgeClassName: "bg-amber-100 text-amber-900 border-amber-200",
      };
  }
}

export function receivablePaymentMethodLabel(method: ReceivablePaymentMethod | string): string {
  switch (method) {
    case "cash":
      return "Tunai";
    case "qris":
      return "QRIS";
    case "bank_transfer":
      return "Transfer Bank";
    default:
      return method;
  }
}

/** Build URL with updated filter/sort/page parameters for Piutang SSR navigation. */
export function buildReceivablesHref(
  current: ReceivableListFilters,
  overrides: Partial<ReceivableListFilters> = {}
): string {
  const next: ReceivableListFilters = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.dueFrom) params.set("due_from", next.dueFrom);
  if (next.dueTo) params.set("due_to", next.dueTo);
  if (next.status && next.status !== "all") params.set("status", next.status);
  if (next.sort !== "due_date") params.set("sort", next.sort);
  if (next.sort !== "due_date" || next.dir !== "asc") params.set("dir", next.dir);
  if (next.page > 1) params.set("page", String(next.page));
  return `/transactions/receivables${params.size ? `?${params.toString()}` : ""}`;
}

export const RECEIVABLE_STATUS_FILTER_OPTIONS: Array<{ value: ReceivableStatusFilter; label: string }> = [
  { value: "all", label: "Semua Status" },
  { value: "unpaid", label: "Belum Lunas" },
  { value: "partial", label: "Sebagian" },
  { value: "overdue", label: "Terlambat" },
  { value: "paid", label: "Lunas" },
  { value: "active", label: "Semua Aktif (Sisa > 0)" },
];

