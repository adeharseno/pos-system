import type { InvoiceItem } from "./invoice-item-repository";
export type ReceivingLine = { item: InvoiceItem; target_unit_id: string | null; old_selling_price: number | null; old_cost_price: number | null; old_tax_rate: number; base_cost: number; quantity_base: number };
export type ReceivingPreview = { invoice_id: string; invoice_number: string; supplier: string; version: number; item_count: number; invoice_total: string; purchase_total: string; difference: string; token: string; items: ReceivingLine[]; price_changes: ReceivingLine[] };
