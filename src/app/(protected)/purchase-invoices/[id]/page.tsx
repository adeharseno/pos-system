import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { getPurchaseInvoice } from "@/modules/purchasing/invoice-repository";
import { PurchaseInvoiceError } from "@/modules/purchasing/invoice-errors";
import { PAYMENT_LABELS, paymentStatus } from "@/modules/purchasing/invoice-input";
import { requireUuid } from "@/modules/shared/validation/input";
import { Card, CardContent, Container } from "@/modules/ui/components";
import { productLinkClass, productPrimaryLinkClass } from "@/modules/catalog/components/product-presentation";
import { formatInvoiceAmount } from "@/modules/purchasing/invoice-presentation";
import { listInvoiceItems } from "@/modules/purchasing/invoice-item-repository";
import { formatReceivingAmount } from "@/modules/purchasing/receiving-presentation";
import type { ReceivingPreview } from "@/modules/purchasing/receiving-types";
import { PaymentStatusBadge } from "@/modules/purchasing/components/payment-status-badge";
import { RecordPaymentDialog } from "@/modules/purchasing/components/record-payment-dialog";
import { PurchaseItemHistory } from "@/modules/purchasing/components/purchase-item-history";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; completed?: string }> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const { id } = await params;
  try { requireUuid(id, "invoice_id"); } catch { notFound(); }
  const invoice = await getPurchaseInvoice(id).catch(error => { if (error instanceof PurchaseInvoiceError && error.status === 404) notFound(); throw error; });
  const paid = invoice.purchase_invoice_payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const total = Math.round(invoice.total_amount * 100);
  const remaining = Math.max(0, total - paid);
  const completed = invoice.status === "completed";
  const snapshot = invoice.finalization_snapshot as unknown as ReceivingPreview | null;
  const receivedItems = await listInvoiceItems(id);
  const flags = await searchParams;
  const items = [
    ["Nama Pemasok", completed && snapshot ? snapshot.supplier : invoice.suppliers?.name ?? "Pemasok tersimpan"], ["Nomor Invoice", invoice.invoice_number],
    ["Tanggal Invoice", new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(`${invoice.invoice_date}T00:00:00+07:00`))],
    ["Total Belanja", formatInvoiceAmount(invoice.total_amount)], ["Jumlah Dibayarkan", formatInvoiceAmount(paid / 100)], ["Sisa Hutang", formatInvoiceAmount(remaining / 100)],
    ["Status Pembayaran", PAYMENT_LABELS[paymentStatus(total, paid)]], ["Status Invoice", completed ? "Selesai" : "Draft"],
  ];
  const payments = [...invoice.purchase_invoice_payments].sort((a,b)=>a.payment_date.localeCompare(b.payment_date)||a.created_at.localeCompare(b.created_at));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <Container size="lg" className="space-y-6"><Link href="/purchase-invoices" className={productLinkClass}>Riwayat Pembelian</Link><header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Detail Pembelian</h1>{remaining>0?<RecordPaymentDialog invoiceId={id} remaining={remaining/100} today={today}/>:null}</header>{flags.completed === "1" && completed ? <p role="status" className="rounded-lg bg-green-50 p-4 text-base font-medium text-green-800">Penerimaan Selesai. Stok dan harga terbaru sudah tersimpan.</p> : flags.saved === "1" && !completed ? <p role="status" className="rounded-lg bg-green-50 p-4 text-base font-medium text-green-800">Invoice berhasil disimpan sebagai Draft.</p> : null}<Card><CardContent className="space-y-6"><div className="flex flex-wrap items-center gap-3"><PaymentStatusBadge totalCents={total} paidCents={paid}/><span className={`rounded-full px-3 py-1 text-sm font-medium ${completed?"bg-blue-50 text-blue-700":"bg-gray-100 text-gray-700"}`}>{completed?"Invoice Selesai":"Invoice Draft"}</span></div><dl className="grid gap-6 text-base sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-gray-600">{label}</dt><dd className="mt-2 break-words font-semibold">{value}</dd></div>)}</dl>{invoice.document_path ? <a href={`/api/purchase-invoices/${id}/document`} className={productLinkClass}>Unduh Invoice: {invoice.document_name}</a> : <p className="text-base text-gray-600">Belum ada dokumen invoice.</p>}{completed ? <div className="space-y-3 text-base"><p className="font-semibold">Penerimaan ini sudah Selesai dan item tidak dapat diubah.</p>{snapshot ? <><p>Total barang diterima: {formatReceivingAmount(snapshot.purchase_total)}</p><p>Selisih terhadap invoice: {formatReceivingAmount(snapshot.difference)}</p></> : null}</div> : <><p className="text-base text-gray-600">Stok dan harga belum berubah. Barang masih dapat dilengkapi sebelum penerimaan diselesaikan.</p><div className="flex flex-wrap gap-3"><Link href={`/purchase-invoices/${id}/items`} className={productPrimaryLinkClass}>Lanjut Isi Barang</Link><Link href={`/purchase-invoices/${id}/edit`} className={productLinkClass}>Edit Invoice Draft</Link></div></>}</CardContent></Card><PurchaseItemHistory items={receivedItems}/><section className="space-y-4"><h2 className="text-xl font-semibold">Riwayat Pembayaran</h2>{payments.length?<div className="grid gap-3">{payments.map(payment=><Card key={payment.id}><CardContent className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-semibold">{formatInvoiceAmount(payment.amount)}</p><p className="mt-1 text-sm text-gray-600">Tanggal pembayaran {new Intl.DateTimeFormat("id-ID",{dateStyle:"long",timeZone:"Asia/Jakarta"}).format(new Date(`${payment.payment_date}T00:00:00+07:00`))}</p></div><p className="text-sm text-gray-600">Dicatat oleh {payment.employees?.full_name??"Owner Admin"}<br/>{new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Jakarta"}).format(new Date(payment.created_at))}</p></CardContent></Card>)}</div>:<Card><CardContent><p className="text-base text-gray-600">Belum ada pembayaran yang tercatat.</p></CardContent></Card>}</section></Container>;
}
