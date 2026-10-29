import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { getPurchaseInvoice } from "@/modules/purchasing/invoice-repository";
import { PurchaseInvoiceError } from "@/modules/purchasing/invoice-errors";
import { InvoiceForm } from "@/modules/purchasing/components/invoice-form";
import { requireUuid } from "@/modules/shared/validation/input";
import { Container } from "@/modules/ui/components";
import { productLinkClass } from "@/modules/catalog/components/product-presentation";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const { id } = await params;
  try { requireUuid(id, "invoice_id"); } catch { notFound(); }
  const invoice = await getPurchaseInvoice(id).catch(error => { if (error instanceof PurchaseInvoiceError && error.status === 404) notFound(); throw error; });
  if (invoice.status !== "draft") redirect(`/purchase-invoices/${id}`);
  return <Container size="lg"><Link href={`/purchase-invoices/${id}`} className={productLinkClass}>Kembali ke Invoice</Link><h1 className="mt-6 text-2xl font-semibold">Edit Invoice Draft</h1><InvoiceForm invoice={invoice} /></Container>;
}
