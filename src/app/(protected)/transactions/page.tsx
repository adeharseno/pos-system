import Link from "next/link";
import { requirePermission } from "@/modules/auth/application/auth-service";
import { formatRupiah } from "@/modules/ui/currency";
import { formatReceiptDate } from "@/modules/sales/receipt";
import {
  jakartaToday,
  listDailySalesTotals,
  listTransactionCashiers,
  listTransactions,
  parseHistoryFilters,
  type DailySalesTotalRow,
  type HistoryFilters,
  type HistoryRow,
  type TransactionCashier,
  type TransactionStatus,
} from "@/modules/sales/transaction-history";
import {
  paymentLabel,
  TransactionStatusBadge,
  transactionLinkClass,
} from "@/modules/sales/components/transaction-presentation";
import { Button, Card, CardContent, CardHeader, Container, FormField, Input, Label, Select } from "@/modules/ui/components";
import { SearchForm } from "@/modules/ui/search-form";

const statuses: [TransactionStatus, string][] = [
  ["completed", "Selesai"],
  ["incomplete_fulfillment", "Barang Belum Lengkap"],
  ["pending_payment", "Menunggu Pembayaran"],
  ["voided", "Dibatalkan"],
];

type FilterOverrides = Partial<
  Pick<HistoryFilters, "q" | "payment" | "status" | "from" | "to" | "cashierId">
>;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const employee = await requirePermission("transactions.view");
  const isOwner = employee.role === "owner_admin";
  const requested = await searchParams;
  const filters = parseHistoryFilters(isOwner ? requested : { page: requested.page });
  const today = jakartaToday();
  let rows: HistoryRow[] = [];
  let total = 0;
  let cashiers: TransactionCashier[] = [];
  let totals: DailySalesTotalRow[] = [];
  let error = false;

  try {
    const [transactions, cashierOptions, dailyTotals] = await Promise.all([
      listTransactions(filters),
      isOwner ? listTransactionCashiers() : Promise.resolve([]),
      isOwner && filters.from && filters.to ? listDailySalesTotals(filters) : Promise.resolve([]),
    ]);
    rows = transactions.rows;
    total = transactions.total;
    cashiers = cashierOptions;
    totals = dailyTotals;
  } catch {
    error = true;
  }

  const pages = Math.max(1, Math.ceil(total / filters.limit));
  const href = (page: number, overrides: FilterOverrides = {}) => {
    const current = { ...filters, ...overrides };
    const params = new URLSearchParams();
    if (current.q) params.set("q", current.q);
    if (current.payment) params.set("payment", current.payment);
    if (current.status) params.set("status", current.status);
    if (current.from) params.set("from", current.from);
    if (current.to) params.set("to", current.to);
    if (current.cashierId) params.set("cashier", current.cashierId);
    if (page > 1) params.set("page", String(page));
    return `/transactions${params.size ? `?${params}` : ""}`;
  };
  const filtered = Boolean(
    filters.q ||
      filters.payment ||
      filters.status ||
      filters.from ||
      filters.to ||
      filters.cashierId,
  );
  const showRecap = Boolean(!error && filters.from && filters.to && totals.length);

  return (
    <Container size="xl" className="space-y-7">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Transaksi</h1>
        <p className="mt-2 text-base text-gray-600">
          Riwayat penjualan dan rekap harian per kasir.
        </p>
      </div>

      {isOwner ? <Card>
        <CardContent>
          <SearchForm
            action="/transactions"
            key={href(filters.page)}
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            <FormField>
              <Label htmlFor="transaction-search">Nomor transaksi</Label>
              <Input
                id="transaction-search"
                name="q"
                defaultValue={filters.q}
                placeholder="Cari nomor transaksi"
                maxLength={80}
              />
            </FormField>
            <FormField>
              <Label htmlFor="transaction-from">Tanggal awal</Label>
              <Input id="transaction-from" name="from" type="date" defaultValue={filters.from} />
            </FormField>
            <FormField>
              <Label htmlFor="transaction-to">Tanggal akhir</Label>
              <Input id="transaction-to" name="to" type="date" defaultValue={filters.to} />
            </FormField>
            <FormField>
              <Label htmlFor="transaction-cashier">Kasir</Label>
              <Select
                id="transaction-cashier"
                name="cashier"
                defaultValue={filters.cashierId ?? ""}
              >
                <option value="">Semua kasir</option>
                {cashiers.map((cashier) => (
                  <option key={cashier.id} value={cashier.id}>
                    {cashier.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField>
              <Label htmlFor="transaction-payment">Metode pembayaran</Label>
              <Select
                id="transaction-payment"
                name="payment"
                defaultValue={filters.payment ?? ""}
              >
                <option value="">Semua metode</option>
                <option value="cash">Tunai</option>
                <option value="qris">QRIS</option>
                <option value="bank_transfer">Transfer Bank</option>
                <option value="bpjs">Ditanggung BPJS</option>
              </Select>
            </FormField>
            <FormField>
              <Label htmlFor="transaction-status">Status transaksi</Label>
              <Select id="transaction-status" name="status" defaultValue={filters.status ?? ""}>
                <option value="">Semua status</option>
                {statuses.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex flex-wrap items-end gap-3 sm:col-span-2 xl:col-span-3">
              <Button type="submit">Terapkan Filter</Button>
              <Link href={href(1, { from: today, to: today })} className={transactionLinkClass}>
                Hari Ini
              </Link>
              <Link href="/transactions" className={transactionLinkClass}>
                Atur Ulang
              </Link>
            </div>
          </SearchForm>
        </CardContent>
      </Card> : null}

      {error ? (
        <Card>
          <CardContent>
            <p role="alert" className="text-base text-red-800">
              Daftar transaksi belum dapat dimuat. Filter Anda tetap tersimpan.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={href(filters.page)} className={transactionLinkClass}>
                Coba Lagi
              </Link>
              {filters.page > 1 ? (
                <Link href={href(1)} className={transactionLinkClass}>
                  Ke Halaman Pertama
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {isOwner && showRecap ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Rekap Harian per Kasir</h2>
                  <p className="text-sm text-gray-600">
                    {filters.status
                      ? "Rekap semua status; filter status hanya untuk daftar transaksi."
                      : "Rekap mengikuti tanggal, kasir, dan metode pembayaran."}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Rekap harian penjualan per kasir</caption>
                    <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                      <tr>
                        <th className="px-4 py-3 font-medium">Tanggal</th>
                        <th className="px-4 py-3 font-medium">Kasir</th>
                        <th className="px-4 py-3 font-medium">Metode</th>
                        <th className="px-4 py-3 font-medium">Jumlah</th>
                        <th className="px-4 py-3 font-medium">Total Penjualan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {totals.map((row, index) => (
                        <tr key={`${row.business_date}-${row.cashier_id}-${row.payment_method}-${index}`} className="text-gray-800">
                          <td className="px-4 py-3">{row.business_date}</td>
                          <td className="px-4 py-3">{row.cashier_name}</td>
                          <td className="px-4 py-3">{paymentLabel(row.payment_method)}</td>
                          <td className="px-4 py-3">{row.sale_count}</td>
                          <td className="px-4 py-3 font-semibold tabular">
                            {formatRupiah(row.completed_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {!rows.length ? (
            <Card>
              <CardContent className="py-10!">
                <h2 className="text-xl font-semibold text-gray-800">
                  {total > 0
                    ? "Tidak ada transaksi di halaman ini."
                    : filtered
                      ? "Tidak ada transaksi yang cocok."
                      : "Belum ada transaksi."}
                </h2>
                <p className="mt-3 text-base text-gray-600">
                  {filtered
                    ? "Sesuaikan filter untuk melihat transaksi lain."
                    : "Transaksi yang tercatat akan tampil di sini."}
                </p>
                {filters.page > 1 ? (
                  <Link href={href(1)} className={`${transactionLinkClass} mt-5`}>
                    Ke Halaman Pertama
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="hidden xl:block">
                <table className="w-full table-fixed text-left text-sm">
                  <caption className="sr-only">Daftar transaksi penjualan</caption>
                  <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                    <tr>
                      <th scope="col" className="w-[22%] px-5 py-5 font-medium">
                        Nomor transaksi
                      </th>
                      <th scope="col" className="w-[18%] px-4 py-5 font-medium">
                        Tanggal dan waktu
                      </th>
                      <th scope="col" className="w-[16%] px-4 py-5 font-medium">
                        Total pembayaran
                      </th>
                      <th scope="col" className="w-[12%] px-4 py-5 font-medium">
                        Metode
                      </th>
                      <th scope="col" className="w-[18%] px-4 py-5 font-medium">
                        Status
                      </th>
                      <th scope="col" className="w-[14%] px-4 py-5 font-medium">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((row) => (
                      <tr key={row.id} className="align-top text-gray-800 hover:bg-gray-50/60">
                        <td className="px-5 py-6">
                          {isOwner ? <Link className="inline-flex min-h-12 items-center break-all font-semibold text-brand-600 underline decoration-brand-300 underline-offset-4" href={`/transactions/${row.id}`}>{row.invoice_number}</Link> : <span className="font-semibold">{row.invoice_number}</span>}
                          <p className="mt-2 break-words text-gray-600">
                            Kasir: {row.employees?.full_name ?? "Kasir"}
                          </p>
                        </td>
                        <td className="break-words px-4 py-6">{formatReceiptDate(row.created_at)}</td>
                        <td className="break-words px-4 py-6 font-semibold tabular">
                          {formatRupiah(row.total_amount)}
                        </td>
                        <td className="break-words px-4 py-6">{paymentLabel(row.payment_method)}</td>
                        <td className="px-4 py-6">
                          <TransactionStatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-6">
                          <Link
                            href={`/transactions/${row.id}`}
                            aria-label={`Lihat detail transaksi ${row.invoice_number}`}
                            className={`${transactionLinkClass} px-3! text-sm!`}
                          >
                            Lihat Detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <div className="grid gap-5 xl:hidden">
                {rows.map((row) => (
                  <Card key={row.id}>
                    <CardContent className="space-y-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h2 className="min-w-0 break-all text-base font-semibold text-gray-900">
                          {row.invoice_number}
                        </h2>
                        <TransactionStatusBadge status={row.status} />
                      </div>
                      <p className="text-base text-gray-600">{formatReceiptDate(row.created_at)}</p>
                      <dl className="grid gap-4 text-base sm:grid-cols-2">
                        <div>
                          <dt className="text-gray-600">Total pembayaran</dt>
                          <dd className="mt-1 break-words text-xl font-semibold text-gray-900 tabular">
                            {formatRupiah(row.total_amount)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-gray-600">Metode pembayaran</dt>
                          <dd className="mt-1 font-medium text-gray-800">
                            {paymentLabel(row.payment_method)}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-gray-600">Kasir</dt>
                          <dd className="mt-1 break-words text-gray-800">
                            {row.employees?.full_name ?? "Kasir"}
                          </dd>
                        </div>
                      </dl>
                      <Link
                        href={`/transactions/${row.id}`}
                        aria-label={`Lihat detail transaksi ${row.invoice_number}`}
                        className={`${transactionLinkClass} w-full`}
                      >
                        Lihat Detail
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {total > 0 ? (
            <nav
              aria-label="Halaman transaksi"
              className="flex flex-wrap items-center justify-between gap-5"
            >
              <p className="text-base text-gray-700">
                {total.toLocaleString("id-ID")} transaksi · Halaman {filters.page} dari {pages}
              </p>
              <div className="flex flex-wrap gap-3">
                {filters.page > 1 ? (
                  <Link href={href(filters.page - 1)} className={transactionLinkClass}>
                    Sebelumnya
                  </Link>
                ) : (
                  <span aria-disabled="true" className={`${transactionLinkClass} opacity-50`}>
                    Sebelumnya
                  </span>
                )}
                {filters.page < pages ? (
                  <Link href={href(filters.page + 1)} className={transactionLinkClass}>
                    Berikutnya
                  </Link>
                ) : (
                  <span aria-disabled="true" className={`${transactionLinkClass} opacity-50`}>
                    Berikutnya
                  </span>
                )}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </Container>
  );
}
