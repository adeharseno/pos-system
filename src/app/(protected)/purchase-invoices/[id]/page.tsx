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
import { getReceivingReceipts } from "@/modules/purchasing/receiving-finalization";
import { ReceivingCompletedSummary } from "@/modules/purchasing/components/receiving-completed-summary";
import { formatReceivingAmount } from "@/modules/purchasing/receiving-presentation";
import type { ReceivingPreview } from "@/modules/purchasing/receiving-types";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; completed?: string }> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const { id } = await params;
  try { requireUuid(id, "invoice_id"); } catch { notFound(); }
  const invoice = await getPurchaseInvoice(id).catch(error => { if (error instanceof PurchaseInvoiceError && error.status === 404) notFound(); throw error; });
  const paid = invoice.purchase_invoice_payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const completed = invoice.status === "completed";
  const snapshot = invoice.finalization_snapshot as unknown as ReceivingPreview | null;
  const [receivedItems, receipts] = completed ? await Promise.all([listInvoiceItems(id), getReceivingReceipts(id)]) : [[], []];
  const flags = await searchParams;
  const items = [
    ["Nama Pemasok", completed && snapshot ? snapshot.supplier : invoice.suppliers?.name ?? "Pemasok tersimpan"], ["Nomor Invoice", invoice.invoice_number],
    ["Tanggal Invoice", new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(`${invoice.invoice_date}T00:00:00+07:00`))],
    ["Total Belanja", formatInvoiceAmount(invoice.total_amount)], ["Jumlah Dibayarkan", formatInvoiceAmount(paid / 100)],
    ["Status Pembayaran", PAYMENT_LABELS[paymentStatus(Math.round(invoice.total_amount * 100), paid)]], ["Status Invoice", completed ? "Selesai" : "Draft"],
  ];
  return <Container size="lg" className="space-y-6"><Link href="/purchase-invoices" className={productLinkClass}>{completed ? "Riwayat Pembelian" : "Daftar Invoice"}</Link><h1 className="text-2xl font-semibold">Invoice Pembelian</h1>{flags.completed === "1" && completed ? <p role="status" className="rounded-lg bg-green-50 p-4 text-base font-medium text-green-800">Penerimaan Selesai. Stok dan harga terbaru sudah tersimpan.</p> : flags.saved === "1" && !completed ? <p role="status" className="rounded-lg bg-green-50 p-4 text-base font-medium text-green-800">Invoice berhasil disimpan sebagai Draft.</p> : null}<Card><CardContent className="space-y-6"><dl className="grid gap-6 text-base sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-gray-600">{label}</dt><dd className="mt-2 break-words font-semibold">{value}</dd></div>)}</dl>{invoice.document_path ? <a href={`/api/purchase-invoices/${id}/document`} className={productLinkClass}>Unduh Invoice: {invoice.document_name}</a> : <p className="text-base text-gray-600">Belum ada dokumen invoice.</p>}{completed ? <div className="space-y-3 text-base"><p className="font-semibold">Penerimaan ini sudah Selesai dan tidak dapat diubah.</p>{snapshot ? <><p>Total barang diterima: {formatReceivingAmount(snapshot.purchase_total)}</p><p>Selisih terhadap invoice: {formatReceivingAmount(snapshot.difference)}</p></> : null}<Link href="/purchase-invoices" className={productPrimaryLinkClass}>Riwayat Pembelian</Link></div> : <><p className="text-base text-gray-600">Stok dan harga belum berubah. Barang disimpan sebagai snapshot Draft.</p><div className="flex flex-wrap gap-3"><Link href={`/purchase-invoices/${id}/items`} className={productPrimaryLinkClass}>Lanjut Isi Barang</Link><Link href={`/purchase-invoices/${id}/edit`} className={productLinkClass}>Edit Invoice Draft</Link></div></>}</CardContent></Card>{completed ? <ReceivingCompletedSummary items={receivedItems} receipts={receipts} /> : null}</Container>;
}
