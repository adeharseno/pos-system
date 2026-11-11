export type ReceiptStatus="pending_payment"|"completed"|"voided";
export interface PrescriptionMetadata{category:"umum"|"bpjs"|"bebas";patientName?:string;bpjsNumber?:string;prescriptionNumber?:string;prescriptionOrigin?:string;prescriptionDate?:string}
export const RECEIPT_PHARMACY_ADDRESS = ["Jln. KSR Dadi Kusmayati No. 26", "CIBINONG"] as const;
export interface ReceiptItem{productName:string;unitName:string;quantity:number;unitPrice:number;lineTotal:number}
export interface ReceiptTotals{subtotal:number;taxAmount:number;total:number}
export interface ReceiptReceivableView{id:string;originalAmount:number;paidAmount:number;creditedReturnAmount:number;outstandingAmount:number;dueDate:string;paymentStatus:"unpaid"|"partial"|"paid"}
export interface ReceiptViewModel{transactionId:string;invoiceNumber:string;createdAt:string;cashierName:string;prescription:PrescriptionMetadata;items:ReceiptItem[];subtotal:number;taxAmount:number;total:number;paymentMethod:"cash"|"qris"|"bank_transfer"|"bpjs"|"tempo";cashReceived?:number;cashChange?:number;status:ReceiptStatus;customerName?:string|null;customerPhone?:string|null;receivable?:ReceiptReceivableView|null}
type PrescriptionRow={prescription_category:string|null;patient_name:string|null;bpjs_number:string|null;prescription_number:string|null;prescription_origin:string|null;prescription_date:string|null};
type ReceivableRow={id:string;original_amount:number;paid_amount:number;credited_return_amount:number;outstanding_amount:number;due_date:string;payment_status:"unpaid"|"partial"|"paid"};
export interface ReceiptTransactionRow{id:string;invoice_number:string;created_at:string;subtotal:number;tax_amount:number;total_amount:number;payment_method:"cash"|"qris"|"bank_transfer"|"bpjs"|"tempo";cash_received:number|null;cash_change:number|null;status:ReceiptStatus;employees:{full_name:string}|null;customers?:{name:string;phone?:string|null}|null;customer_receivables?:ReceivableRow|ReceivableRow[]|null;transaction_prescriptions:PrescriptionRow[];transaction_items:Array<{quantity_in_unit:number;unit_price:number;total_amount:number;product_name_snapshot:string;unit_name_snapshot:string}>}

export function receivableStatusLabel(status:"unpaid"|"partial"|"paid"|null|undefined){
  if(status==="paid")return"LUNAS";
  if(status==="partial")return"SEBAGIAN";
  return"BELUM LUNAS";
}
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
    ...(row.customers?.name?{customerName:row.customers.name,customerPhone:row.customers.phone??null}:{}),
    ...(row.customer_receivables?(()=>{const rec=Array.isArray(row.customer_receivables)?row.customer_receivables[0]:row.customer_receivables;return rec?{receivable:{id:rec.id,originalAmount:Number(rec.original_amount),paidAmount:Number(rec.paid_amount),creditedReturnAmount:Number(rec.credited_return_amount),outstandingAmount:Number(rec.outstanding_amount),dueDate:rec.due_date,paymentStatus:rec.payment_status}}:{};})():{}),
    status:row.status
  };
}

const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (cents: number): number => Number((cents / 100).toFixed(2));

/**
 * Resolves authoritative display totals for receipts and transaction details.
 * Uses database totals as the source of truth so historical taxed items are not
 * double-counted, while adding any unrecorded legacy BPJS susulan line totals.
 */
export function resolveReceiptTotals(
  receipt: Pick<ReceiptViewModel, "items" | "subtotal" | "taxAmount" | "total">,
  susulanItems: ReadonlyArray<{ lineTotal: number }> = []
): ReceiptTotals {
  const regularItemsCents = receipt.items.reduce(
    (acc, item) => acc + toCents(item.lineTotal),
    0
  );
  const susulanCents = susulanItems.reduce(
    (acc, item) => acc + toCents(item.lineTotal),
    0
  );
  const receiptSubtotalCents = toCents(receipt.subtotal);
  const receiptTaxCents = toCents(receipt.taxAmount);
  const receiptTotalCents = toCents(receipt.total);

  const unrecordedSusulanCents =
    susulanItems.length > 0
      ? Math.max(0, regularItemsCents + susulanCents - receiptTotalCents)
      : 0;

  return {
    subtotal: fromCents(receiptSubtotalCents + unrecordedSusulanCents),
    taxAmount: fromCents(receiptTaxCents),
    total: fromCents(receiptTotalCents + unrecordedSusulanCents),
  };
}

export function formatReceiptDate(value:string){return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value)).replace(" pukul ", " · ");}
export function formatPrescriptionDate(value:string){return new Intl.DateTimeFormat("id-ID",{timeZone:"UTC",day:"2-digit",month:"short",year:"numeric"}).format(new Date(`${value}T00:00:00Z`));}
export const receiptStatusLabel=(status:ReceiptStatus)=>status==="completed"?"LUNAS":status==="pending_payment"?"MENUNGGU PEMBAYARAN":"DIBATALKAN";
