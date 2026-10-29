import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { listPurchaseInvoices } from "@/modules/purchasing/invoice-repository";
import { PAYMENT_LABELS, paymentStatus } from "@/modules/purchasing/invoice-input";
import { Card, CardContent, Container } from "@/modules/ui/components";
import { productLinkClass, productPrimaryLinkClass } from "@/modules/catalog/components/product-presentation";
import { formatInvoiceAmount } from "@/modules/purchasing/invoice-presentation";

export default async function Page() {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const invoices = await listPurchaseInvoices();
  return <Container size="lg" className="space-y-6"><Link href="/products" className={productLinkClass}>Daftar Barang</Link><header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Invoice Pembelian</h1><Link href="/purchase-invoices/new" className={productPrimaryLinkClass}>Terima Barang</Link></header><p className="text-base text-gray-600">Menampilkan hingga 100 invoice terbaru.</p>{!invoices.length ? <Card><CardContent>Belum ada invoice pembelian.</CardContent></Card> : <div className="grid gap-5 sm:grid-cols-2">{invoices.map(invoice => {
    const paid = invoice.purchase_invoice_payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
    return <Card key={invoice.id}><CardContent className="space-y-4 text-base"><h2 className="break-words text-lg font-semibold">{invoice.invoice_number}</h2><p className="break-words">{invoice.suppliers?.name ?? "Pemasok tersimpan"}</p><p>Total: {formatInvoiceAmount(invoice.total_amount)}</p><p>{invoice.status === "completed" ? "Selesai" : "Draft"} · {PAYMENT_LABELS[paymentStatus(Math.round(invoice.total_amount * 100), paid)]}</p><Link href={`/purchase-invoices/${invoice.id}`} className={productLinkClass}>Lihat Invoice</Link></CardContent></Card>;
  })}</div>}</Container>;
}
