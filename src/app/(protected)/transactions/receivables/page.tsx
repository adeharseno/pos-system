import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/application/auth-service";
import { listReceivablesForOwner } from "@/modules/receivables/application/receivables-service";
import {
  buildReceivablesHref,
  parseReceivableListFilters,
  RECEIVABLE_STATUS_FILTER_OPTIONS,
} from "@/modules/receivables/receivables-filters";
import type {
  ReceivableListFilters,
  ReceivableSortColumn,
} from "@/modules/receivables/receivables-types";
import { ReceivableStatusBadge } from "@/modules/receivables/components/receivable-status-badge";
import { TransactionModuleTabs } from "@/modules/sales/components/transaction-module-tabs";
import { transactionLinkClass } from "@/modules/sales/components/transaction-presentation";
import { Button, Card, CardContent, Container, FormField, Input, Label, Select } from "@/modules/ui/components";
import { formatRupiah } from "@/modules/ui/currency";
import { formatIndonesianDate } from "@/modules/ui/date";
import { SearchForm } from "@/modules/ui/search-form";

const SORTABLE_COLUMNS: Array<{ key: ReceivableSortColumn; label: string; align?: "right" }> = [
  { key: "invoice_number", label: "Nomor Invoice" },
  { key: "transaction_date", label: "Tanggal Transaksi" },
  { key: "original_amount", label: "Total Tagihan", align: "right" },
  { key: "paid_amount", label: "Sudah Dibayar", align: "right" },
  { key: "outstanding_amount", label: "Sisa Piutang", align: "right" },
  { key: "due_date", label: "Tanggal Jatuh Tempo" },
  { key: "status", label: "Status" },
];

function nextSortDirection(filters: ReceivableListFilters, column: ReceivableSortColumn) {
  if (filters.sort === column) {
    return filters.dir === "asc" ? "desc" : "asc";
  }
  return column === "due_date" || column === "invoice_number" || column === "customer_name"
    ? "asc"
    : "desc";
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireRole(["owner_admin"]);
  } catch {
    redirect("/transactions");
  }

  const filters = parseReceivableListFilters(await searchParams);

  let data: Awaited<ReturnType<typeof listReceivablesForOwner>> | undefined;
  let error = false;

  try {
    data = await listReceivablesForOwner(filters);
  } catch {
    error = true;
  }

  const summary = data?.summary ?? {
    totalActiveOutstanding: 0,
    unpaidInvoiceCount: 0,
    dueSoonCount: 0,
    overdueOutstanding: 0,
    overdueCount: 0,
  };
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / filters.limit));

  return (
    <Container size="xl" className="space-y-7">
      <TransactionModuleTabs current="receivables" isOwner={true} />

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Piutang</h1>
        <p className="mt-2 text-base text-gray-600">
          Pantau tagihan pelanggan, jatuh tempo, dan pelunasan.
        </p>
      </div>

      <section aria-label="Ringkasan piutang" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-1.5 py-5!">
            <h2 className="text-sm font-medium text-gray-600">Total Piutang Aktif</h2>
            <p className="text-2xl font-semibold text-gray-900 tabular">
              {formatRupiah(summary.totalActiveOutstanding)}
            </p>
            <p className="text-xs text-gray-500">Total sisa tagihan belum lunas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5 py-5!">
            <h2 className="text-sm font-medium text-gray-600">Belum Lunas</h2>
            <p className="text-2xl font-semibold text-gray-900 tabular">
              {summary.unpaidInvoiceCount.toLocaleString("id-ID")}
            </p>
            <p className="text-xs text-gray-500">Invoice dengan sisa tagihan &gt; Rp 0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5 py-5!">
            <h2 className="text-sm font-medium text-gray-600">Jatuh Tempo &le;3 Hari</h2>
            <p className="text-2xl font-semibold text-amber-800 tabular">
              {summary.dueSoonCount.toLocaleString("id-ID")}
            </p>
            <p className="text-xs text-gray-500">Invoice aktif jatuh tempo dalam 3 hari</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5 py-5!">
            <h2 className="text-sm font-medium text-gray-600">Terlambat</h2>
            <p className="text-2xl font-semibold text-red-700 tabular">
              {formatRupiah(summary.overdueOutstanding)}
            </p>
            <p className="text-xs text-gray-500">
              {summary.overdueCount.toLocaleString("id-ID")} invoice melewati jatuh tempo
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent>
          <SearchForm
            action="/transactions/receivables"
            key={buildReceivablesHref(filters)}
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            <FormField>
              <Label htmlFor="receivable-search">Nomor invoice atau nama pelanggan</Label>
              <Input
                id="receivable-search"
                name="q"
                defaultValue={filters.q}
                placeholder="Cari nomor invoice atau pelanggan"
                maxLength={80}
              />
            </FormField>
            <FormField>
              <Label htmlFor="receivable-due-from">Jatuh tempo awal</Label>
              <Input
                id="receivable-due-from"
                name="due_from"
                type="date"
                defaultValue={filters.dueFrom}
              />
            </FormField>
            <FormField>
              <Label htmlFor="receivable-due-to">Jatuh tempo akhir</Label>
              <Input
                id="receivable-due-to"
                name="due_to"
                type="date"
                defaultValue={filters.dueTo}
              />
            </FormField>
            <FormField>
              <Label htmlFor="receivable-status">Status piutang</Label>
              <Select id="receivable-status" name="status" defaultValue={filters.status}>
                {RECEIVABLE_STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            {filters.sort !== "due_date" ? (
              <input type="hidden" name="sort" value={filters.sort} />
            ) : null}
            {filters.sort !== "due_date" || filters.dir !== "asc" ? (
              <input type="hidden" name="dir" value={filters.dir} />
            ) : null}
            <div className="flex flex-wrap items-end gap-3 sm:col-span-2 xl:col-span-4">
              <Button type="submit">Terapkan Filter</Button>
              <Link href="/transactions/receivables" className={transactionLinkClass}>
                Atur Ulang
              </Link>
            </div>
          </SearchForm>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="space-y-4">
            <p role="alert" className="text-base text-red-800">
              Data piutang belum dapat dimuat. Silakan coba lagi.
            </p>
            <Link href={buildReceivablesHref(filters)} className={transactionLinkClass}>
              Coba Lagi
            </Link>
          </CardContent>
        </Card>
      ) : !rows.length ? (
        <Card>
          <CardContent className="py-10! text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              {filters.q || filters.dueFrom || filters.dueTo || filters.status !== "all"
                ? "Tidak ada tagihan piutang yang sesuai filter."
                : "Belum ada catatan piutang TEMPO."}
            </h2>
            <p className="mt-2 text-base text-gray-600">
              {filters.q || filters.dueFrom || filters.dueTo || filters.status !== "all"
                ? "Ubah kata kunci pencarian, rentang jatuh tempo, atau status piutang."
                : "Transaksi TEMPO dari kasir akan muncul secara otomatis di daftar ini."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full text-left text-base">
                <caption className="sr-only">Daftar piutang transaksi TEMPO pelanggan</caption>
                <thead className="border-b border-gray-200 bg-gray-50 text-sm text-gray-700">
                  <tr>
                    {SORTABLE_COLUMNS.map((col) => {
                      const active = filters.sort === col.key;
                      const indicator = active ? (filters.dir === "asc" ? "↑" : "↓") : "↕";
                      return (
                        <th
                          key={col.key}
                          scope="col"
                          className={`px-4 py-4 font-semibold ${col.align === "right" ? "text-right" : ""}`}
                        >
                          <Link
                            href={buildReceivablesHref(filters, {
                              sort: col.key,
                              dir: nextSortDirection(filters, col.key),
                              page: 1,
                            })}
                            className={`inline-flex items-center gap-1 hover:text-brand-600 ${
                              active ? "text-brand-700" : ""
                            }`}
                          >
                            <span>{col.label}</span>
                            <span aria-hidden="true" className="text-xs">
                              {indicator}
                            </span>
                          </Link>
                        </th>
                      );
                    })}
                    <th scope="col" className="px-4 py-4 text-right font-semibold">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/70">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">{row.invoiceNumber}</p>
                        <p className="mt-0.5 text-sm text-gray-600">
                          {row.customerName}
                          {row.customerPhone ? ` · ${row.customerPhone}` : ""}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-700">
                        {formatIndonesianDate(row.businessDate)}
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-gray-900 tabular">
                        {formatRupiah(row.originalAmount)}
                      </td>
                      <td className="px-4 py-4 text-right tabular">
                        <p className="font-medium text-gray-800">{formatRupiah(row.paidAmount)}</p>
                        {row.creditedReturnAmount > 0 ? (
                          <p className="text-xs text-blue-700">
                            Retur: -{formatRupiah(row.creditedReturnAmount)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-gray-900 tabular">
                        {formatRupiah(row.outstandingAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-700">
                        {formatIndonesianDate(row.dueDate)}
                      </td>
                      <td className="px-4 py-4">
                        <ReceivableStatusBadge
                          status={row.effectiveStatus}
                          paidAmount={row.paidAmount}
                        />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/transactions/receivables/${row.id}`}
                          className={transactionLinkClass}
                        >
                          Lihat Detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:hidden">
            {rows.map((row) => (
              <Card key={row.id}>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{row.invoiceNumber}</p>
                      <p className="mt-0.5 text-sm text-gray-700">{row.customerName}</p>
                    </div>
                    <ReceivableStatusBadge
                      status={row.effectiveStatus}
                      paidAmount={row.paidAmount}
                    />
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-500">Tanggal Transaksi</dt>
                      <dd className="mt-0.5 font-medium text-gray-900">
                        {formatIndonesianDate(row.businessDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Jatuh Tempo</dt>
                      <dd className="mt-0.5 font-medium text-gray-900">
                        {formatIndonesianDate(row.dueDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Total Tagihan</dt>
                      <dd className="mt-0.5 font-medium text-gray-900 tabular">
                        {formatRupiah(row.originalAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Sudah Dibayar</dt>
                      <dd className="mt-0.5 font-medium text-gray-900 tabular">
                        {formatRupiah(row.paidAmount)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-gray-500">Sisa Piutang</dt>
                      <dd className="mt-0.5 text-lg font-bold text-gray-900 tabular">
                        {formatRupiah(row.outstandingAmount)}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/transactions/receivables/${row.id}`}
                    className={`${transactionLinkClass} w-full`}
                  >
                    Lihat Detail
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <nav
            aria-label="Halaman daftar piutang"
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <p className="text-base text-gray-700">
              {total.toLocaleString("id-ID")} tagihan &middot; Halaman{" "}
              {filters.page.toLocaleString("id-ID")} dari {pages.toLocaleString("id-ID")}
            </p>
            <div className="flex gap-3">
              {filters.page > 1 ? (
                <Link
                  href={buildReceivablesHref(filters, { page: filters.page - 1 })}
                  className={transactionLinkClass}
                >
                  Sebelumnya
                </Link>
              ) : (
                <span aria-disabled="true" className={`${transactionLinkClass} opacity-50`}>
                  Sebelumnya
                </span>
              )}
              {filters.page < pages ? (
                <Link
                  href={buildReceivablesHref(filters, { page: filters.page + 1 })}
                  className={transactionLinkClass}
                >
                  Berikutnya
                </Link>
              ) : (
                <span aria-disabled="true" className={`${transactionLinkClass} opacity-50`}>
                  Berikutnya
                </span>
              )}
            </div>
          </nav>
        </>
      )}
    </Container>
  );
}

