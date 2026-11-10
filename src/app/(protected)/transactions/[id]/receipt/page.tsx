import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getReceiptTransaction } from "@/modules/sales/data/transaction-queries";
import { getSusulanItemsForTransaction } from "@/modules/sales/data/bpjs-susulan-queries";
import { buildReceiptViewModel,formatPrescriptionDate,formatReceiptDate,RECEIPT_PHARMACY_ADDRESS,sanitizeReceiptProductName,type ReceiptTransactionRow } from "@/modules/sales/receipt";
import { PrintReceiptButton } from "@/modules/sales/components/print-receipt-button";
import { formatRupiah } from "@/modules/ui/currency";
import { requireUuid } from "@/modules/shared/validation/input";

const value=(text:string|undefined)=>text||"-";
const paymentName=(method:"cash"|"qris"|"bank_transfer"|"bpjs")=>method==="cash"?"TUNAI":method==="qris"?"QRIS":method==="bank_transfer"?"TRANSFER BANK":"DITANGGUNG BPJS";
const statusDisplay=(status:"completed"|"pending_payment"|"voided")=>status==="completed"?"LUNAS":status==="pending_payment"?"BELUM LUNAS":"DIBATALKAN";

export default async function ReceiptPage({params}:{params:Promise<{id:string}>}){
  await requirePosOperator();const{id}=await params;let transactionId;
  try{transactionId=requireUuid(id,"transactionId");}catch{notFound();}
  const [row, susulanItems] = await Promise.all([
    getReceiptTransaction(transactionId),
    getSusulanItemsForTransaction(transactionId).catch(() => []),
  ]);
  if(!row)notFound();
  const receipt=buildReceiptViewModel(row as unknown as ReceiptTransactionRow);
  const statusLabel = statusDisplay(receipt.status);

  // Combine regular items and susulan items without any special label or suffix
  const allItems = [
    ...receipt.items.map((item) => ({
      ...item,
      productName: sanitizeReceiptProductName(item.productName),
    })),
    ...susulanItems.map((item) => ({
      productName: sanitizeReceiptProductName(item.drugName),
      unitName: "unit",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  ];

  const calculatedSubtotal = allItems.reduce((acc, it) => acc + it.lineTotal, 0);
  const finalSubtotal = Math.max(receipt.subtotal, calculatedSubtotal);
  const finalTotal = finalSubtotal + receipt.taxAmount;

  return <main className="receipt-page min-h-screen px-4 py-6 sm:px-6">
    <div className="receipt-actions mx-auto mb-4 flex w-full max-w-[360px] flex-wrap gap-2"><Link className="flex min-h-11 flex-1 items-center justify-center rounded-[7px] border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold" href="/cashier">Kembali ke Kasir</Link><PrintReceiptButton/></div>
    <article className="receipt-document mx-auto w-full max-w-[360px] bg-white px-3.5 py-3 text-zinc-950 shadow-sm leading-[1.25]">
      <header className="text-center"><h1 className="text-[11.5px] font-bold tracking-[.06em] leading-tight">APOTEK CIPAYUNG FARMA</h1><div className="mt-0.5 text-[8.5px] leading-tight text-zinc-700">{RECEIPT_PHARMACY_ADDRESS.map(line=><p key={line}>{line}</p>)}</div><p className="mt-1.5 break-all font-mono text-[9.5px] font-bold leading-tight">{receipt.invoiceNumber}</p><p className="mt-0.5 text-[8.5px] text-zinc-600 leading-tight">{formatReceiptDate(receipt.createdAt)}</p><p className="mt-0.5 text-[8.5px] text-zinc-600 leading-tight">Kasir: {receipt.cashierName}</p></header>
      {receipt.prescription.category!=="bebas"?<dl className="mt-2 grid gap-0.5 border-t border-dashed border-zinc-400 py-1.5 text-[8.5px] leading-tight"><div className="flex gap-2"><dt className="w-24 shrink-0">Kategori RESEP</dt><dd className="font-semibold">{receipt.prescription.category.toUpperCase()}</dd></div><div className="flex gap-2"><dt className="w-24 shrink-0">Nama Pasien</dt><dd className="break-words">{value(receipt.prescription.patientName)}</dd></div>{receipt.prescription.category==="bpjs"?<div className="flex gap-2"><dt className="w-24 shrink-0">No BPJS</dt><dd className="break-all">{value(receipt.prescription.bpjsNumber)}</dd></div>:null}<div className="flex gap-2"><dt className="w-24 shrink-0">No Resep</dt><dd className="break-all">{value(receipt.prescription.prescriptionNumber)}</dd></div><div className="flex gap-2"><dt className="w-24 shrink-0">Asal Resep</dt><dd className="break-words">{value(receipt.prescription.prescriptionOrigin)}</dd></div><div className="flex gap-2"><dt className="w-24 shrink-0">TGL Resep</dt><dd>{receipt.prescription.prescriptionDate?formatPrescriptionDate(receipt.prescription.prescriptionDate):"-"}</dd></div></dl>:<p className="mt-2 border-t border-dashed border-zinc-400 py-1.5 text-center text-[8.5px] font-semibold leading-tight">KATEGORI BEBAS</p>}
      {receipt.status==="pending_payment"?<div className="border-t border-dashed border-zinc-400 py-1.5 text-center text-[9px] leading-tight"><p className="font-bold text-amber-900">INVOICE PEMBAYARAN</p><p className="mt-0.5 text-[8.5px] text-zinc-600">Status: BELUM LUNAS</p><p className="mt-0.5 text-[8px] text-zinc-600">Dokumen ini adalah tagihan pembayaran {paymentName(receipt.paymentMethod)}, bukan bukti lunas.</p></div>:null}{receipt.status==="voided"?<div className="border-t border-zinc-900 py-1 text-center text-[9px] font-bold leading-tight">TRANSAKSI DIBATALKAN</div>:null}
      <section aria-label="Item transaksi" className="divide-y divide-dashed divide-zinc-300 border-y border-dashed border-zinc-400">{allItems.map((item,index)=><div className="py-0.5 text-[9.5px] leading-tight" key={index}><div className="flex justify-between gap-2 items-baseline"><p className="min-w-0 font-semibold break-words">{item.productName}</p><p className="tabular shrink-0 font-semibold">{formatRupiah(item.lineTotal)}</p></div><p className="tabular mt-0.5 text-[8.5px] text-zinc-600">{item.quantity} {item.unitName} × {formatRupiah(item.unitPrice)}</p></div>)}</section>
      <dl className="mt-2 grid gap-0.5 text-[8.5px] leading-tight"><div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular">{formatRupiah(finalSubtotal)}</dd></div>{receipt.taxAmount>0?<div className="flex justify-between"><dt>Pajak</dt><dd className="tabular">{formatRupiah(receipt.taxAmount)}</dd></div>:null}<div className="mt-1 flex justify-between border-t border-zinc-900 pt-1 text-[11.5px] font-bold leading-tight"><dt>TOTAL</dt><dd className="tabular">{formatRupiah(finalTotal)}</dd></div><div className="flex justify-between"><dt>Pembayaran</dt><dd className="font-semibold">{receipt.paymentMethod==="bpjs"?"DITANGGUNG BPJS":paymentName(receipt.paymentMethod)}</dd></div>{(receipt.paymentMethod==="cash"||receipt.paymentMethod==="bpjs")&&receipt.cashReceived!==undefined?<><div className="flex justify-between"><dt>{receipt.paymentMethod==="cash"?"TUNAI":"UANG DITERIMA"}</dt><dd className="tabular">{formatRupiah(receipt.cashReceived)}</dd></div><div className="flex justify-between"><dt>KEMBALI</dt><dd className="tabular">{formatRupiah(receipt.cashChange??0)}</dd></div></>:null}<div className="flex justify-between"><dt>Status</dt><dd className={`font-bold ${receipt.status==="voided"?"text-red-700":receipt.status==="pending_payment"?"text-amber-800":""}`}>{statusLabel}</dd></div></dl>
      <footer className="mt-2.5 border-t border-dashed border-zinc-400 pt-1.5 text-center text-[8px] text-zinc-600 leading-tight"><p>Terima kasih.</p></footer>
    </article>
  </main>;
}
