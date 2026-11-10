import Link from "next/link";
import { requirePermission } from "@/modules/auth/application/auth-service";
import { listReturns, type ReturnListFilters } from "@/modules/returns/data/return-queries";
import { formatRupiah } from "@/modules/ui/currency";
import { formatReceiptDate } from "@/modules/sales/receipt";
import { Button, Card, CardContent, Container, FormField, Input, Label, Select } from "@/modules/ui/components";
import { SearchForm } from "@/modules/ui/search-form";
import type { ReturnStatus } from "@/modules/returns/types";

const statusOptions: Array<{ value: string; label: string }> = [
  { value: "all", label: "Semua Status" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  if (status === "pending_approval") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        Pending Approval
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
        Approved
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
        Completed
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
      Rejected
    </span>
  );
}

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("returns.view");
  const params = await searchParams;

  const filters: ReturnListFilters = {
    q: params.q?.trim() || undefined,
    status: params.status || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    page: parseInt(params.page || "1", 10) || 1,
    limit: 20,
  };

  let rows: Awaited<ReturnType<typeof listReturns>>["rows"] = [];
  let total = 0;
  let error = false;

  try {
    const res = await listReturns(filters);
    rows = res.rows;
    total = res.total;
  } catch {
    error = true;
  }

  const pages = Math.max(1, Math.ceil(total / (filters.limit ?? 20)));

  const href = (page: number, overrides: Partial<ReturnListFilters> = {}) => {
    const next = { ...filters, ...overrides };
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.status && next.status !== "all") sp.set("status", next.status);
    if (next.from) sp.set("from", next.from);
    if (next.to) sp.set("to", next.to);
    if (page > 1) sp.set("page", String(page));
    return `/returns${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <Container size="xl" className="space-y-7">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Daftar Retur Barang</h1>
        <p className="mt-2 text-base text-gray-600">
          Kelola dan tinjau permintaan retur transaksi pelanggan dari kasir.
        </p>
      </div>

      <Card>
        <CardContent>
          <SearchForm
            action="/returns"
            key={href(filters.page ?? 1)}
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            <FormField>
              <Label htmlFor="return-search">Nomor retur / invoice / alasan</Label>
              <Input
                id="return-search"
                name="q"
                defaultValue={filters.q}
                placeholder="Cari nomor retur atau invoice"
                maxLength={80}
              />
            </FormField>
            <FormField>
              <Label htmlFor="return-status">Status</Label>
              <Select id="return-status" name="status" defaultValue={filters.status ?? "all"}>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField>
              <Label htmlFor="return-from">Tanggal awal</Label>
              <Input id="return-from" name="from" type="date" defaultValue={filters.from} />
            </FormField>
            <FormField>
              <Label htmlFor="return-to">Tanggal akhir</Label>
              <Input id="return-to" name="to" type="date" defaultValue={filters.to} />
            </FormField>
            <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
              <Button type="submit">Terapkan Filter</Button>
              <Link
                href="/returns"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Reset
              </Link>
            </div>
          </SearchForm>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50 p-6 text-center text-red-700">
          Daftar retur belum dapat dimuat. Silakan muat ulang halaman.
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-gray-500">
            Tidak ada data retur yang sesuai dengan filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-700">
                <tr>
                  <th className="px-5 py-4">Nomor Retur / Invoice</th>
                  <th className="px-5 py-4">Tanggal Pengajuan</th>
                  <th className="px-5 py-4">Kasir Pengaju</th>
                  <th className="px-5 py-4">Barang</th>
                  <th className="px-5 py-4">Total Refund</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-4">
                      <strong className="block font-semibold text-gray-900">
                        {row.returnNumber || "(Belum Disetujui)"}
                      </strong>
                      <span className="text-xs text-gray-500">Faktur: {row.invoiceNumber}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-900">{formatReceiptDate(row.createdAt)}</td>
                    <td className="px-5 py-4 text-gray-900">{row.cashierName}</td>
                    <td className="px-5 py-4">{row.itemsCount} barang</td>
                    <td className="px-5 py-4 font-semibold text-gray-900 tabular">
                      {formatRupiah(row.refundTotal)}
                    </td>
                    <td className="px-5 py-4">
                      <ReturnStatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/returns/${row.id}`}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-gray-900 px-3.5 text-xs font-semibold text-white hover:bg-gray-800"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <Card key={row.id}>
                <CardContent className="space-y-2.5 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="block font-semibold text-gray-900">
                        {row.returnNumber || "(Belum Disetujui)"}
                      </strong>
                      <span className="text-xs text-gray-500">Faktur: {row.invoiceNumber}</span>
                    </div>
                    <ReturnStatusBadge status={row.status} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>{formatReceiptDate(row.createdAt)}</span>
                    <span>Oleh: {row.cashierName}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-2 font-medium">
                    <span>Total Refund:</span>
                    <strong className="tabular text-brand-600">{formatRupiah(row.refundTotal)}</strong>
                  </div>
                  <div className="pt-1">
                    <Link
                      href={`/returns/${row.id}`}
                      className="flex min-h-10 w-full items-center justify-center rounded-lg bg-gray-900 px-4 text-xs font-semibold text-white"
                    >
                      Lihat Detail Retur
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 ? (
            <div className="flex items-center justify-between border-t border-gray-200 pt-4 text-sm">
              <span className="text-gray-600">
                Halaman {filters.page} dari {pages} ({total} total data)
              </span>
              <div className="flex gap-2">
                <Link
                  href={href((filters.page ?? 1) - 1)}
                  className={`inline-flex min-h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold ${
                    (filters.page ?? 1) <= 1 ? "pointer-events-none opacity-40" : "hover:bg-gray-50"
                  }`}
                >
                  Sebelumnya
                </Link>
                <Link
                  href={href((filters.page ?? 1) + 1)}
                  className={`inline-flex min-h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold ${
                    (filters.page ?? 1) >= pages ? "pointer-events-none opacity-40" : "hover:bg-gray-50"
                  }`}
                >
                  Selanjutnya
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Container>
  );
}

