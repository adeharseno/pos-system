import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireRole } from "@/modules/auth/application/auth-service";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";

type PaymentMethod = "cash" | "qris";
type TransactionStatus = "pending_payment" | "completed" | "voided";

type SessionRow = {
  id: string;
  employee_id: string;
  opening_balance: number;
  closing_balance_expected: number | null;
  closing_balance_actual: number | null;
  variance: number | null;
  opened_at: string;
  closed_at: string | null;
  is_open: boolean | null;
  employees: { full_name: string } | null;
};

type TransactionRow = {
  id: string;
  cash_drawer_session_id: string;
  invoice_number: string;
  created_at: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  cash_received: number | null;
  cash_change: number | null;
  status: TransactionStatus;
  voided_at: string | null;
  void_reason: string | null;
};

type ItemRow = {
  id: string;
  transaction_id: string;
  product_name_snapshot: string;
  unit_name_snapshot: string;
  quantity_in_unit: number;
  quantity_in_base: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
};

type ItemBatchRow = {
  transaction_item_id: string;
  quantity_in_base: number;
  cost_price_snapshot: number;
};

type ReturnRow = {
  id: string;
  cash_drawer_session_id: string;
  transaction_id: string | null;
  refund_method: PaymentMethod | null;
  reason: string;
  refund_subtotal: number;
  refund_tax_amount: number;
  refund_total: number;
  created_at: string;
  employees: { full_name: string } | null;
};

type ReturnItemRow = {
  id: string;
  return_id: string;
  quantity_in_base: number;
  refund_subtotal: number;
  refund_tax_amount: number;
  refund_total: number;
  created_at: string;
  products: { name: string; base_unit: string } | null;
};

type ReturnBatchRow = {
  return_item_id: string;
  quantity_in_base: number;
  cost_price_snapshot: number;
};

type SessionActivity = {
  transactions: TransactionRow[];
  itemsByTransaction: Map<string, ItemRow[]>;
  batchesByItem: Map<string, ItemBatchRow[]>;
  returns: ReturnRow[];
  returnItemsByReturn: Map<string, ReturnItemRow[]>;
  returnBatchesByItem: Map<string, ReturnBatchRow[]>;
};

export type CashDrawerSessionMetrics = {
  transactionCount: number;
  salesTotal: number;
  salesRevenue: number;
  refunds: number;
  netRevenue: number;
  cogs: number;
  returnedCogs: number;
  grossProfit: number;
  marginPercent: number | null;
  cashSales: number;
  qrisSales: number;
  cashRefunds: number;
};

export type CashDrawerSessionRow = {
  id: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  isOpen: boolean;
  openingBalance: number;
  closingBalanceExpected: number | null;
  closingBalanceActual: number | null;
  variance: number | null;
  metrics: CashDrawerSessionMetrics;
};

export type CashDrawerFlowEntry = {
  key: string;
  kind: "out" | "in";
  occurredAt: string;
  productName: string;
  quantity: number;
  unit: string;
  quantityInBase: number;
  reference: string;
  amount: number;
  transactionStatus: TransactionStatus | null;
};

export type CashDrawerPaymentRow = {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  method: PaymentMethod;
  status: TransactionStatus;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  cashReceived: number | null;
  cashChange: number | null;
};

export type CashDrawerRefundRow = {
  id: string;
  invoiceNumber: string | null;
  createdAt: string;
  method: PaymentMethod | null;
  reason: string;
  total: number;
  processedBy: string;
};

export type CashDrawerSessionDetail = CashDrawerSessionRow & {
  payments: CashDrawerPaymentRow[];
  refunds: CashDrawerRefundRow[];
  flow: CashDrawerFlowEntry[];
};

const cents = (value: number | null | undefined) => Math.round((value ?? 0) * 100);
const rupiah = (value: number) => value / 100;

function emptyActivity(): SessionActivity {
  return {
    transactions: [],
    itemsByTransaction: new Map(),
    batchesByItem: new Map(),
    returns: [],
    returnItemsByReturn: new Map(),
    returnBatchesByItem: new Map(),
  };
}

async function loadActivity(sessionIds: string[]): Promise<Map<string, SessionActivity>> {
  const activity = new Map(sessionIds.map((id) => [id, emptyActivity()]));
  if (!sessionIds.length) return activity;

  const supabase = createAdminSupabaseClient();
  const { data: transactionData, error: transactionError } = await supabase
    .from("transactions")
    .select("id,cash_drawer_session_id,invoice_number,created_at,subtotal,tax_amount,total_amount,payment_method,cash_received,cash_change,status,voided_at,void_reason")
    .in("cash_drawer_session_id", sessionIds)
    .order("created_at", { ascending: true });
  if (transactionError) throw mapDatabaseError(transactionError);
  const transactions = (transactionData ?? []) as unknown as TransactionRow[];
  const sessionByTransaction = new Map<string, string>();
  for (const transaction of transactions) {
    sessionByTransaction.set(transaction.id, transaction.cash_drawer_session_id);
    activity.get(transaction.cash_drawer_session_id)?.transactions.push(transaction);
  }

  const transactionIds = transactions.map((transaction) => transaction.id);
  if (transactionIds.length) {
    const { data: itemData, error: itemError } = await supabase
      .from("transaction_items")
      .select("id,transaction_id,product_name_snapshot,unit_name_snapshot,quantity_in_unit,quantity_in_base,subtotal,tax_amount,total_amount,created_at")
      .in("transaction_id", transactionIds)
      .order("created_at", { ascending: true });
    if (itemError) throw mapDatabaseError(itemError);
    const items = (itemData ?? []) as unknown as ItemRow[];
    const sessionByItem = new Map<string, string>();
    for (const item of items) {
      const sessionId = sessionByTransaction.get(item.transaction_id);
      if (!sessionId) continue;
      const sessionActivity = activity.get(sessionId);
      if (!sessionActivity) continue;
      sessionByItem.set(item.id, sessionId);
      const transactionItems = sessionActivity.itemsByTransaction.get(item.transaction_id) ?? [];
      transactionItems.push(item);
      sessionActivity.itemsByTransaction.set(item.transaction_id, transactionItems);
    }

    const itemIds = items.map((item) => item.id);
    if (itemIds.length) {
      const { data: batchData, error: batchError } = await supabase
        .from("transaction_item_batches")
        .select("transaction_item_id,quantity_in_base,cost_price_snapshot")
        .in("transaction_item_id", itemIds);
      if (batchError) throw mapDatabaseError(batchError);
      for (const batch of (batchData ?? []) as unknown as ItemBatchRow[]) {
        const sessionId = sessionByItem.get(batch.transaction_item_id);
        const sessionActivity = sessionId ? activity.get(sessionId) : undefined;
        if (!sessionActivity) continue;
        const batches = sessionActivity.batchesByItem.get(batch.transaction_item_id) ?? [];
        batches.push(batch);
        sessionActivity.batchesByItem.set(batch.transaction_item_id, batches);
      }
    }
  }

  const { data: returnData, error: returnError } = await supabase
    .from("returns")
    .select("id,cash_drawer_session_id,transaction_id,refund_method,reason,refund_subtotal,refund_tax_amount,refund_total,created_at,employees!returns_processed_by_fkey(full_name)")
    .in("cash_drawer_session_id", sessionIds)
    .order("created_at", { ascending: true });
  if (returnError) throw mapDatabaseError(returnError);
  const returns = (returnData ?? []) as unknown as ReturnRow[];
  const sessionByReturn = new Map<string, string>();
  for (const record of returns) {
    sessionByReturn.set(record.id, record.cash_drawer_session_id);
    activity.get(record.cash_drawer_session_id)?.returns.push(record);
  }

  const returnIds = returns.map((record) => record.id);
  if (returnIds.length) {
    const { data: returnItemData, error: returnItemError } = await supabase
      .from("return_items")
      .select("id,return_id,quantity_in_base,refund_subtotal,refund_tax_amount,refund_total,created_at,products!return_items_product_id_fkey(name,base_unit)")
      .in("return_id", returnIds)
      .order("created_at", { ascending: true });
    if (returnItemError) throw mapDatabaseError(returnItemError);
    const returnItems = (returnItemData ?? []) as unknown as ReturnItemRow[];
    const sessionByReturnItem = new Map<string, string>();
    for (const item of returnItems) {
      const sessionId = sessionByReturn.get(item.return_id);
      if (!sessionId) continue;
      const sessionActivity = activity.get(sessionId);
      if (!sessionActivity) continue;
      sessionByReturnItem.set(item.id, sessionId);
      const items = sessionActivity.returnItemsByReturn.get(item.return_id) ?? [];
      items.push(item);
      sessionActivity.returnItemsByReturn.set(item.return_id, items);
    }

    const returnItemIds = returnItems.map((item) => item.id);
    if (returnItemIds.length) {
      const { data: returnBatchData, error: returnBatchError } = await supabase
        .from("return_item_batches")
        .select("return_item_id,quantity_in_base,cost_price_snapshot")
        .in("return_item_id", returnItemIds);
      if (returnBatchError) throw mapDatabaseError(returnBatchError);
      for (const batch of (returnBatchData ?? []) as unknown as ReturnBatchRow[]) {
        const sessionId = sessionByReturnItem.get(batch.return_item_id);
        const sessionActivity = sessionId ? activity.get(sessionId) : undefined;
        if (!sessionActivity) continue;
        const batches = sessionActivity.returnBatchesByItem.get(batch.return_item_id) ?? [];
        batches.push(batch);
        sessionActivity.returnBatchesByItem.set(batch.return_item_id, batches);
      }
    }
  }

  return activity;
}

function calculateMetrics(sessionActivity: SessionActivity): CashDrawerSessionMetrics {
  const completed = sessionActivity.transactions.filter((transaction) => transaction.status === "completed");
  let salesTotal = 0;
  let salesRevenue = 0;
  let cashSales = 0;
  let qrisSales = 0;
  for (const transaction of completed) {
    salesTotal += cents(transaction.total_amount);
    salesRevenue += cents(transaction.subtotal);
    if (transaction.payment_method === "cash") cashSales += cents(transaction.total_amount);
    else qrisSales += cents(transaction.total_amount);
  }

  let cogs = 0;
  for (const transaction of completed) {
    for (const item of sessionActivity.itemsByTransaction.get(transaction.id) ?? []) {
      for (const batch of sessionActivity.batchesByItem.get(item.id) ?? []) {
        cogs += batch.quantity_in_base * cents(batch.cost_price_snapshot);
      }
    }
  }

  let refunds = 0;
  let cashRefunds = 0;
  for (const record of sessionActivity.returns) {
    refunds += cents(record.refund_subtotal);
    if (record.refund_method === "cash") cashRefunds += cents(record.refund_total);
  }

  let returnedCogs = 0;
  for (const record of sessionActivity.returns) {
    for (const item of sessionActivity.returnItemsByReturn.get(record.id) ?? []) {
      for (const batch of sessionActivity.returnBatchesByItem.get(item.id) ?? []) {
        returnedCogs += batch.quantity_in_base * cents(batch.cost_price_snapshot);
      }
    }
  }

  const netRevenue = salesRevenue - refunds;
  const grossProfit = netRevenue - cogs + returnedCogs;
  return {
    transactionCount: completed.length,
    salesTotal: rupiah(salesTotal),
    salesRevenue: rupiah(salesRevenue),
    refunds: rupiah(refunds),
    netRevenue: rupiah(netRevenue),
    cogs: rupiah(cogs),
    returnedCogs: rupiah(returnedCogs),
    grossProfit: rupiah(grossProfit),
    marginPercent: netRevenue === 0 ? null : (grossProfit / netRevenue) * 100,
    cashSales: rupiah(cashSales),
    qrisSales: rupiah(qrisSales),
    cashRefunds: rupiah(cashRefunds),
  };
}

function toSessionRow(session: SessionRow, sessionActivity: SessionActivity): CashDrawerSessionRow {
  return {
    id: session.id,
    cashierName: session.employees?.full_name ?? "Kasir",
    openedAt: session.opened_at,
    closedAt: session.closed_at,
    isOpen: Boolean(session.is_open),
    openingBalance: session.opening_balance,
    closingBalanceExpected: session.closing_balance_expected,
    closingBalanceActual: session.closing_balance_actual,
    variance: session.variance,
    metrics: calculateMetrics(sessionActivity),
  };
}

export async function listCashDrawerSessions(page = 1, pageSize = 20) {
  await requireRole(["owner_admin"]);
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 20;
  const from = (safePage - 1) * safePageSize;
  const supabase = createAdminSupabaseClient();
  const { data, error, count } = await supabase
    .from("cash_drawer_sessions")
    .select("id,employee_id,opening_balance,closing_balance_expected,closing_balance_actual,variance,opened_at,closed_at,is_open,employees!cash_drawer_sessions_employee_id_fkey(full_name)", { count: "exact" })
    .order("opened_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + safePageSize - 1);
  if (error) throw mapDatabaseError(error);
  const sessions = (data ?? []) as unknown as SessionRow[];
  const activity = await loadActivity(sessions.map((session) => session.id));
  return {
    rows: sessions.map((session) => toSessionRow(session, activity.get(session.id) ?? emptyActivity())),
    total: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function getCashDrawerSessionDetail(sessionId: string): Promise<CashDrawerSessionDetail | null> {
  await requireRole(["owner_admin"]);
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("cash_drawer_sessions")
    .select("id,employee_id,opening_balance,closing_balance_expected,closing_balance_actual,variance,opened_at,closed_at,is_open,employees!cash_drawer_sessions_employee_id_fkey(full_name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw mapDatabaseError(error);
  if (!data) return null;
  const session = data as unknown as SessionRow;
  const activity = (await loadActivity([session.id])).get(session.id) ?? emptyActivity();
  const sessionRow = toSessionRow(session, activity);
  const transactionsById = new Map(activity.transactions.map((transaction) => [transaction.id, transaction]));

  const payments: CashDrawerPaymentRow[] = activity.transactions.map((transaction) => ({
    id: transaction.id,
    invoiceNumber: transaction.invoice_number,
    createdAt: transaction.created_at,
    method: transaction.payment_method,
    status: transaction.status,
    subtotal: transaction.subtotal,
    taxAmount: transaction.tax_amount,
    totalAmount: transaction.total_amount,
    cashReceived: transaction.cash_received,
    cashChange: transaction.cash_change,
  }));

  const refunds: CashDrawerRefundRow[] = activity.returns.map((record) => ({
    id: record.id,
    invoiceNumber: record.transaction_id ? transactionsById.get(record.transaction_id)?.invoice_number ?? null : null,
    createdAt: record.created_at,
    method: record.refund_method,
    reason: record.reason,
    total: record.refund_total,
    processedBy: record.employees?.full_name ?? "Kasir",
  }));

  const flow: CashDrawerFlowEntry[] = [];
  for (const transaction of activity.transactions) {
    for (const item of activity.itemsByTransaction.get(transaction.id) ?? []) {
      flow.push({
        key: `out-${item.id}`,
        kind: "out",
        occurredAt: item.created_at,
        productName: item.product_name_snapshot,
        quantity: item.quantity_in_unit,
        unit: item.unit_name_snapshot,
        quantityInBase: item.quantity_in_base,
        reference: transaction.invoice_number,
        amount: item.total_amount,
        transactionStatus: transaction.status,
      });
    }
  }
  for (const record of activity.returns) {
    const invoiceNumber = record.transaction_id ? transactionsById.get(record.transaction_id)?.invoice_number ?? "" : "";
    for (const item of activity.returnItemsByReturn.get(record.id) ?? []) {
      flow.push({
        key: `in-${item.id}`,
        kind: "in",
        occurredAt: item.created_at,
        productName: item.products?.name ?? "Barang retur",
        quantity: item.quantity_in_base,
        unit: item.products?.base_unit ?? "unit dasar",
        quantityInBase: item.quantity_in_base,
        reference: invoiceNumber ? `Retur · ${invoiceNumber}` : "Retur",
        amount: item.refund_total,
        transactionStatus: null,
      });
    }
  }
  flow.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  return { ...sessionRow, payments, refunds, flow };
}
