import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { InvoiceForm } from "@/modules/purchasing/components/invoice-form";
import { Container } from "@/modules/ui/components";
import { productLinkClass } from "@/modules/catalog/components/product-presentation";

export default async function Page() {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  return <Container size="lg"><Link href="/purchase-invoices" className={productLinkClass}>Daftar Invoice</Link><h1 className="mt-6 text-2xl font-semibold">Penerimaan Barang Baru</h1><p className="mt-2 text-base text-gray-600">Catat invoice pembelian terlebih dahulu.</p><InvoiceForm /></Container>;
}
