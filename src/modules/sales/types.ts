export type PaymentMethod = "cash" | "qris";

export interface CheckoutItemInput { productUnitId: string; quantity: number }
export interface PrescriptionInput {
  prescriptionNumber?: string;
  doctorName: string;
  patientName: string;
  photoUrl?: string;
}
export interface CheckoutInput {
  employeeId: string;
  cashDrawerSessionId: string;
  paymentMethod: PaymentMethod;
  items: CheckoutItemInput[];
  cashReceived?: number;
  prescription?: PrescriptionInput;
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
