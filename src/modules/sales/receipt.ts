export type ReceiptStatus="pending_payment"|"completed"|"voided";
export interface PrescriptionMetadata{category:"umum"|"bpjs"|"bebas";patientName?:string;bpjsNumber?:string;prescriptionNumber?:string;prescriptionOrigin?:string;prescriptionDate?:string}
export const RECEIPT_PHARMACY_ADDRESS = ["Jln. KSR Dadi Kusmayati No. 26", "CIBINONG"] as const;
export interface ReceiptItem{productName:string;unitName:string;quantity:number;unitPrice:number;lineTotal:number}
export interface ReceiptViewModel{transactionId:string;invoiceNumber:string;createdAt:string;cashierName:string;prescription:PrescriptionMetadata;items:ReceiptItem[];subtotal:number;taxAmount:number;total:number;paymentMethod:"cash"|"qris"|"bank_transfer"|"bpjs";cashReceived?:number;cashChange?:number;status:ReceiptStatus}
type PrescriptionRow={prescription_category:string|null;patient_name:string|null;bpjs_number:string|null;prescription_number:string|null;prescription_origin:string|null;prescription_date:string|null};
export interface ReceiptTransactionRow{id:string;invoice_number:string;created_at:string;subtotal:number;tax_amount:number;total_amount:number;payment_method:"cash"|"qris"|"bank_transfer"|"bpjs";cash_received:number|null;cash_change:number|null;status:ReceiptStatus;employees:{full_name:string}|null;transaction_prescriptions:PrescriptionRow[];transaction_items:Array<{quantity_in_unit:number;unit_price:number;total_amount:number;product_name_snapshot:string;unit_name_snapshot:string}>}
const optional=(value:string|null|undefined)=>value||undefined;

/**
 * Strips '(Produk Tambahan)' suffix or variations from receipt item names,
 * ensuring products are displayed cleanly as e.g. 'BPJS ASETOSAL 100 TAB'.
 */
export function sanitizeReceiptProductName(name: string): string {
  if (!name) return "";
  return name
    .replace(/\s*[\(\[]\s*produk\s+tambahan\s*[\)\]]/gi, "")
    .replace(/\s*-\s*produk\s+tambahan/gi, "")
    .trim();
}

export function buildReceiptViewModel(row:ReceiptTransactionRow):ReceiptViewModel{
  const prescription=row.transaction_prescriptions[0];
  const category=prescription?.prescription_category==="bpjs"?"bpjs":prescription?.prescription_category==="bebas"?"bebas":"umum";
  return{
    transactionId:row.id,
    invoiceNumber:row.invoice_number,
    createdAt:row.created_at,
    cashierName:row.employees?.full_name??"Kasir",
    prescription:{category,patientName:optional(prescription?.patient_name),bpjsNumber:optional(prescription?.bpjs_number),prescriptionNumber:optional(prescription?.prescription_number),prescriptionOrigin:optional(prescription?.prescription_origin),prescriptionDate:optional(prescription?.prescription_date)},
    items:row.transaction_items.map(item=>({
      productName:sanitizeReceiptProductName(item.product_name_snapshot),
      unitName:item.unit_name_snapshot,
      quantity:item.quantity_in_unit,
      unitPrice:item.unit_price,
      lineTotal:item.total_amount
    })),
    subtotal:row.subtotal,
    taxAmount:row.tax_amount,
    total:row.total_amount,
    paymentMethod:row.payment_method,
    ...((row.payment_method==="cash"||row.payment_method==="bpjs")&&row.cash_received!==null&&row.cash_change!==null?{cashReceived:row.cash_received,cashChange:row.cash_change}:{}),
    status:row.status
  };
}

export function formatReceiptDate(value:string){return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value)).replace(" pukul ", " · ");}
export function formatPrescriptionDate(value:string){return new Intl.DateTimeFormat("id-ID",{timeZone:"UTC",day:"2-digit",month:"short",year:"numeric"}).format(new Date(`${value}T00:00:00Z`));}
export const receiptStatusLabel=(status:ReceiptStatus)=>status==="completed"?"LUNAS":status==="pending_payment"?"MENUNGGU PEMBAYARAN":"DIBATALKAN";
