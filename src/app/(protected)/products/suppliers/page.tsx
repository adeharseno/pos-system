import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { listSuppliers } from "@/modules/catalog/data/supplier-repository";
import { SupplierManagement } from "@/modules/catalog/components/supplier-management";
import { Button, Card, CardContent, Container, FormField, Input, Label } from "@/modules/ui/components";
import { productLinkClass } from "@/modules/catalog/components/product-presentation";
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  try { await requireRole(["owner_admin"]); } catch { redirect("/products"); }
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 200);
  const page = /^\d+$/.test(params.page ?? "") ? Math.max(1, Math.min(10000, Number(params.page))) : 1;
  const href = (number: number) => "/products/suppliers?" + new URLSearchParams({ q, page: String(number) });
  let data = { rows: [] as Awaited<ReturnType<typeof listSuppliers>>["rows"], total: 0 };
  let failed = false;
  try { data = await listSuppliers(q, page); } catch { failed = true; }
  return <Container size="lg" className="space-y-6"><header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Kelola Pemasok</h1><Link href="/products" className={productLinkClass}>Kembali ke Daftar Barang</Link></header>
    <Card><CardContent><form action="/products/suppliers" className="flex flex-col gap-4 sm:flex-row sm:items-end"><FormField className="min-w-0 flex-1"><Label htmlFor="supplier-search">Cari nama pemasok</Label><Input id="supplier-search" name="q" defaultValue={q} maxLength={200} /></FormField><Button type="submit">Cari Pemasok</Button><Link href="/products/suppliers" className={productLinkClass}>Atur Ulang</Link></form></CardContent></Card>
    {failed ? <Card><CardContent><p role="alert" className="mb-4 text-base text-red-800">Daftar pemasok belum dapat dimuat. Silakan coba lagi.</p><Link href={href(page)} className={productLinkClass}>Coba Lagi</Link></CardContent></Card> : <><SupplierManagement rows={data.rows} /><nav aria-label="Halaman daftar pemasok" className="flex flex-wrap items-center justify-between gap-4"><p>{data.total} pemasok ? Halaman {page} dari {Math.max(1, Math.ceil(data.total / 20))}</p><div className="flex gap-3">{page > 1 ? <Link href={href(page - 1)} className={productLinkClass}>Sebelumnya</Link> : null}{page * 20 < data.total ? <Link href={href(page + 1)} className={productLinkClass}>Berikutnya</Link> : null}</div></nav></>}
  </Container>;
}
