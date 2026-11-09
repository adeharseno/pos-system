/** Types for BPJS Produk Susulan (follow-up products). */

export type BpjsSusulanFulfillmentStatus = "pending_fulfillment" | "completed";

export interface BpjsSusulanItem {
  id: string;
  transactionId: string;
  productId: string | null;
  drugName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  deliveryDate: string; // ISO date YYYY-MM-DD
  fulfillmentStatus: BpjsSusulanFulfillmentStatus;
  fulfilledBy: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  createdBy: string;
  requestKey: string;
}

/** Input for one susulan item at checkout time. */
export interface SusulanItemInput {
  drugName: string;
  quantity: number;
  unitPrice: number;
  /** UUID unique per item within this checkout attempt. Generated client-side. */
  requestKey: string;
}

export interface BpjsSusulanNotification {
  transactionId: string;
  invoiceNumber: string;
  patientName: string | null;
  pendingCount: number;
}
