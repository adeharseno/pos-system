import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { requireUuid } from "@/modules/shared/validation/input";
import { Container } from "@/modules/ui/components";
import { productLinkClass } from "@/modules/catalog/components/product-presentation";
import { getPurchaseInvoice } from "@/modules/purchasing/invoice-repository";
import { listInvoiceItems } from "@/modules/purchasing/invoice-item-repository";
import { PurchaseInvoiceError } from "@/modules/purchasing/invoice-errors";
import { InvoiceItemsWorkspace } from "@/modules/purchasing/components/invoice-items-workspace";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const { id } = await params;
  try { requireUuid(id, "invoice_id"); } catch { notFound(); }
  const invoice = await getPurchaseInvoice(id).catch(error => { if (error instanceof PurchaseInvoiceError && error.status === 404) notFound(); throw error; });
  const items = await listInvoiceItems(id);
  if (invoice.status !== "draft") redirect(`/purchase-invoices/${id}`);
  return <Container size="xl" className="space-y-6"><Link href={`/purchase-invoices/${id}`} className={productLinkClass}>Kembali ke Detail Invoice</Link><h1 className="text-2xl font-semibold">Isi Barang Invoice</h1><p className="text-base text-gray-600">Barang disimpan dalam Draft. Stok dan harga produk belum berubah.</p><InvoiceItemsWorkspace initialInvoice={invoice} initialItems={items} /></Container>;
}
