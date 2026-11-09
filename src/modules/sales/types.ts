export type PaymentMethod = "cash" | "qris" | "bank_transfer" | "bpjs";
export const DEFAULT_PRESCRIPTION_CATEGORY = "bebas" as const;
export const PRESCRIPTION_CATEGORY_DISPLAY_ORDER = ["bebas", "umum", "bpjs"] as const;

export interface CheckoutItemInput { productUnitId: string; quantity: number }
export interface PrescriptionInput {
  category: "umum" | "bpjs" | "bebas";
  prescriptionNumber?: string;
  patientName?: string;
  bpjsNumber?: string;
  prescriptionOrigin?: string;
  prescriptionDate?: string;
}
export interface SupplementaryItemInput {
  drugName: string;
  quantity: number;
  unitPrice: number;
}
export interface CheckoutInput {
  requestId: string;
  employeeId: string;
  paymentMethod: PaymentMethod;
  items: CheckoutItemInput[];
  cashReceived?: number;
  prescription?: PrescriptionInput;
  supplementaryItems?: SupplementaryItemInput[];
}
export interface CheckoutResult {
  transactionId: string;
  invoiceNumber: string;
  status: "pending_payment" | "completed";
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  cashChange: number | null;
}
export interface TransactionActionInput { employeeId: string; transactionId: string }
export interface VoidTransactionInput extends TransactionActionInput { reason: string }
export interface TransactionStatusResult { transactionId: string; status: "completed" | "voided" }
