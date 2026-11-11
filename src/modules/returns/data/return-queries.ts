import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { ItemCondition, RefundStatus, ReturnDetail, ReturnDetailItem, ReturnStatus } from "../types";

export interface ReturnNotification {
  id: string;
  invoiceNumber: string;
  cashierName: string;
  refundTotal: number;
  itemCount: number;
  createdAt: string;
}

export async function getPendingReturnCount(): Promise<number> {
  const { count, error } = await createAdminSupabaseClient()
    .from("returns")
    .select("id", { count: "exact", head: true })
    .eq("source", "customer")
    .eq("status", "pending_approval");

  if (error) throw mapDatabaseError(error);
  return count ?? 0;
}

export async function getPendingReturnNotifications(): Promise<ReturnNotification[]> {
  const { data, error } = await createAdminSupabaseClient()
    .from("returns")
    .select(
      `id, refund_total, created_at,
       transactions!returns_transaction_id_fkey(invoice_number),
       employees!returns_processed_by_fkey(full_name),
       return_items(id)`
    )
    .eq("source", "customer")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw mapDatabaseError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    invoiceNumber: (row.transactions as { invoice_number: string } | null)?.invoice_number ?? "",
    cashierName: (row.employees as { full_name: string } | null)?.full_name ?? "Kasir",
    refundTotal: Number(row.refund_total ?? 0),
    itemCount: Array.isArray(row.return_items) ? row.return_items.length : 0,
    createdAt: row.created_at,
  }));
}

export interface ReturnListFilters {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ReturnListItem {
  id: string;
  returnNumber: string | null;
  invoiceNumber: string;
  transactionId: string;
  createdAt: string;
  status: ReturnStatus;
  refundStatus: RefundStatus;
  refundMethod: string;
  refundTotal: number;
  reason: string;
  cashierName: string;
  reviewerName: string | null;
  itemsCount: number;
}

export async function listReturns(filters: ReturnListFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
  const fromOffset = (page - 1) * limit;

  let query = createAdminSupabaseClient()
    .from("returns")
    .select(
      `id, return_number, created_at, status, refund_status, refund_method, refund_total, reason, transaction_id,
       transactions!returns_transaction_id_fkey(invoice_number),
       cashier:employees!returns_processed_by_fkey(full_name),
       reviewer:employees!returns_reviewed_by_fkey(full_name),
       return_items(id)`,
      { count: "exact" }
    )
    .eq("source", "customer")
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.from) {
    query = query.gte("created_at", `${filters.from}T00:00:00+07:00`);
  }
  if (filters.to) {
    const nextDate = new Date(`${filters.to}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    query = query.lt("created_at", `${nextDate.toISOString().slice(0, 10)}T00:00:00+07:00`);
  }

  if (filters.q) {
    const term = filters.q.trim();
    query = query.or(`return_number.ilike.%${term}%,reason.ilike.%${term}%`);
  }

  const { data, error, count } = await query.range(fromOffset, fromOffset + limit - 1);
  if (error) throw mapDatabaseError(error);

  const rows: ReturnListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    returnNumber: row.return_number,
    invoiceNumber: (row.transactions as { invoice_number: string } | null)?.invoice_number ?? "",
    transactionId: row.transaction_id ?? "",
    createdAt: row.created_at,
    status: (row.status ?? "completed") as ReturnStatus,
    refundStatus: (row.refund_status ?? "completed") as RefundStatus,
    refundMethod: row.refund_method ?? "cash",
    refundTotal: Number(row.refund_total ?? 0),
    reason: row.reason,
    cashierName: (row.cashier as { full_name: string } | null)?.full_name ?? "Kasir",
    reviewerName: (row.reviewer as { full_name: string } | null)?.full_name ?? null,
    itemsCount: Array.isArray(row.return_items) ? row.return_items.length : 0,
  }));

  return { rows, total: count ?? 0 };
}

export type { ReturnDetail, ReturnDetailItem };

export async function getReturnDetail(returnId: string): Promise<ReturnDetail | null> {
  const { data, error } = await createAdminSupabaseClient()
    .from("returns")
    .select(
      `id, return_number, created_at, status, refund_status, refund_method, refund_subtotal, refund_tax_amount, refund_total,
       receivable_credit_amount, cash_refund_amount,
       reason, admin_notes, transaction_id, reviewed_at, refund_confirmed_at,
       transactions!returns_transaction_id_fkey(invoice_number, created_at, payment_method),
       cashier:employees!returns_processed_by_fkey(full_name),
       reviewer:employees!returns_reviewed_by_fkey(full_name),
       return_items(
         id, product_id, quantity_in_base, refund_subtotal, refund_tax_amount, refund_total, condition, is_restocked,
         products(name),
         transaction_items(unit_name_snapshot, conversion_to_base_snapshot, unit_price)
       )`
    )
    .eq("id", returnId)
    .maybeSingle();

  if (error) throw mapDatabaseError(error);
  if (!data) return null;

  const tx = data.transactions as { invoice_number: string; created_at: string; payment_method: string } | null;
  const cashier = data.cashier as { full_name: string } | null;
  const reviewer = data.reviewer as { full_name: string } | null;

  const items: ReturnDetailItem[] = (data.return_items ?? []).map((it) => {
    const prod = it.products as { name: string } | null;
    const ti = it.transaction_items as {
      unit_name_snapshot: string;
      conversion_to_base_snapshot: number;
      unit_price: number;
    } | null;

    const conversion = ti?.conversion_to_base_snapshot || 1;
    const qtyInBase = it.quantity_in_base;
    const qtyInUnit = Math.floor(qtyInBase / conversion);

    return {
      id: it.id,
      productId: it.product_id,
      productName: prod?.name ?? "Produk",
      unitName: ti?.unit_name_snapshot ?? "Unit",
      quantityInBase: qtyInBase,
      conversionToBase: conversion,
      quantityInUnit: qtyInUnit,
      unitPrice: ti?.unit_price ?? 0,
      refundSubtotal: Number(it.refund_subtotal ?? 0),
      refundTaxAmount: Number(it.refund_tax_amount ?? 0),
      refundTotal: Number(it.refund_total ?? 0),
      condition: (it.condition ?? "good") as ItemCondition,
      isRestocked: Boolean(it.is_restocked),
    };
  });

  return {
    id: data.id,
    returnNumber: data.return_number,
    createdAt: data.created_at,
    status: (data.status ?? "completed") as ReturnStatus,
    refundStatus: (data.refund_status ?? "completed") as RefundStatus,
    refundMethod: data.refund_method ?? "cash",
    refundSubtotal: Number(data.refund_subtotal ?? 0),
    refundTaxAmount: Number(data.refund_tax_amount ?? 0),
    refundTotal: Number(data.refund_total ?? 0),
    receivableCreditAmount: Number(data.receivable_credit_amount ?? 0),
    cashRefundAmount:
      data.cash_refund_amount !== null && data.cash_refund_amount !== undefined
        ? Number(data.cash_refund_amount)
        : Number(data.refund_total ?? 0),
    reason: data.reason,
    adminNotes: data.admin_notes,
    transactionId: data.transaction_id ?? "",
    invoiceNumber: tx?.invoice_number ?? "",
    transactionDate: tx?.created_at ?? data.created_at,
    transactionPaymentMethod: tx?.payment_method ?? "cash",
    cashierName: cashier?.full_name ?? "Kasir",
    reviewerName: reviewer?.full_name ?? null,
    reviewedAt: data.reviewed_at,
    refundConfirmedAt: data.refund_confirmed_at,
    items,
  };
}

export async function getReturnsForTransaction(transactionId: string) {
  const { data, error } = await createAdminSupabaseClient()
    .from("returns")
    .select(
      `id, return_number, created_at, status, refund_status, refund_total, reason, admin_notes,
       employees!returns_processed_by_fkey(full_name),
       return_items(id, product_id, quantity_in_base, refund_total, condition, is_restocked, products(name))`
    )
    .eq("transaction_id", transactionId)
    .eq("source", "customer")
    .order("created_at", { ascending: false });

  if (error) throw mapDatabaseError(error);
  return data ?? [];
}
