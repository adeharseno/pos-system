import Link from "next/link";
import { requirePosOperator } from "@/modules/auth/application/auth-service";
import { getCustomerReturns, getTransaction } from "@/modules/sales/data/transaction-queries";
import { listTransactions } from "@/modules/sales/transaction-history";
import { formatReceiptDate } from "@/modules/sales/receipt";
import { returnQuantity } from "@/modules/returns/return-quantity";
import { amountCents } from "@/modules/returns/refund-preview";
import { CashierReturnForm } from "@/modules/returns/components/cashier-return-form";
import { requireUuid } from "@/modules/shared/validation/input";
import { Button, Card, CardContent, Input } from "@/modules/ui/components";
import { formatRupiah } from "@/modules/ui/currency";

type SearchParams = { q?: string; transaction?: string };

export default async function CashierReturnsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePosOperator();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  let results: Awaited<ReturnType<typeof listTransactions>>["rows"] = [];
  let transaction: Awaited<ReturnType<typeof getTransaction>> = null;
  let records: Awaited<ReturnType<typeof getCustomerReturns>> = [];
  let error: string | null = null;

  try {
    if (query) {
      results = (await listTransactions({ q: query, page: 1, limit: 20 })).rows;
      if (params.transaction) {
        const id = requireUuid(params.transaction, "transaction");
        const selected = results.find((item) => item.id === id);
        if (selected?.status === "completed") {
          transaction = await getTransaction(id);
          if (transaction?.status === "completed") records = await getCustomerReturns(id);
          else transaction = null;
        }
      }
    }
  } catch {
    error = "Data transaksi tidak dapat dimuat. Periksa kembali nomor faktur dan coba lagi.";
  }

  const returned = new Map<string, number>();
  const returnedAmounts = new Map<string, { subtotal: bigint; tax: bigint }>();
  for (const record of records) {
    for (const item of record.return_items ?? []) {
      if (item.transaction_item_id) {
        returned.set(item.transaction_item_id, (returned.get(item.transaction_item_id) ?? 0) + item.quantity_in_base);
        const amounts = returnedAmounts.get(item.transaction_item_id) ?? { subtotal: BigInt(0), tax: BigInt(0) };
        returnedAmounts.set(item.transaction_item_id, { subtotal: amounts.subtotal + amountCents(item.refund_subtotal), tax: amounts.tax + amountCents(item.refund_tax_amount) });
      }
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-5">
      <header className="shrink-0">
        <h1 className="text-2xl font-semibold">Retur Barang</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Cari nomor faktur untuk melihat barang yang dapat diretur.</p>
        <form className="mt-4 flex gap-2" action="/cashier/returns">
          <label className="sr-only" htmlFor="invoice">Nomor faktur</label>
          <Input id="invoice" name="q" defaultValue={query} placeholder="Cari nomor faktur" autoFocus />
          <Button type="submit">Cari</Button>
        </form>
        {error ? <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </header>
      <div className="mt-4 grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
        <section className="min-h-0 lg:overflow-y-auto" aria-label="Hasil pencarian transaksi">
          {!query ? <p className="text-sm text-[var(--text-muted)]">Masukkan nomor faktur untuk mencari transaksi.</p> : null}
          {query && !error && results.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Transaksi tidak ditemukan.</p> : null}
          {results.length === 20 ? <p className="mb-3 text-sm text-[var(--text-muted)]">Menampilkan 20 hasil pertama. Masukkan nomor faktur lebih lengkap untuk mempersempit pencarian.</p> : null}
          <div className="grid gap-3">
            {results.map((item) => (
              <Card key={item.id}>
                <CardContent className="grid gap-2 py-4 text-sm">
                  <strong>{item.invoice_number}</strong>
                  <p>{formatReceiptDate(item.created_at)}</p>
                  <p>Pembayaran: {item.payment_method === "cash" ? "Tunai" : item.payment_method === "qris" ? "QRIS" : "Transfer Bank"}</p>
                  <p>Status: {item.status === "completed" ? "Lunas" : item.status === "pending_payment" ? "Menunggu pembayaran" : "Dibatalkan"}</p>
                  <p>Total: {formatRupiah(item.total_amount)}</p>
                  {item.status === "completed" ? (
                    <Link className="min-h-11 content-center font-semibold text-[var(--accent)] underline" href={`/cashier/returns?q=${encodeURIComponent(query)}&transaction=${encodeURIComponent(item.id)}`}>Pilih transaksi</Link>
                  ) : <p className="font-medium text-[var(--text-muted)]">Transaksi ini belum dapat diretur.</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
        <section className="min-h-0 lg:overflow-y-auto" aria-label="Barang dalam transaksi">
          {transaction && (transaction.payment_method === "cash" || transaction.payment_method === "qris") ? (
            <CashierReturnForm key={transaction.id} id={transaction.id} invoice={transaction.invoice_number} payment={transaction.payment_method} items={transaction.transaction_items.map((item) => {
              const returnedBase = returned.get(item.id) ?? 0;
              const previous = returnedAmounts.get(item.id) ?? { subtotal: BigInt(0), tax: BigInt(0) };
              return {
                id: item.id, name: item.product_name_snapshot, unit: item.unit_name_snapshot,
                conversion: item.conversion_to_base_snapshot, purchasedBase: item.quantity_in_base,
                returnedBase, unitPrice: item.unit_price, totalAmount: item.total_amount,
                quantityInUnit: item.quantity_in_unit,
                subtotalCents: amountCents(item.subtotal).toString(), taxCents: amountCents(item.tax_amount).toString(),
                returnedSubtotalCents: previous.subtotal.toString(), returnedTaxCents: previous.tax.toString(),
                ...returnQuantity({ purchasedBase: item.quantity_in_base, returnedBase, conversionToBase: item.conversion_to_base_snapshot }),
              };
            })} />
          ) : transaction ? (
            <p className="text-sm text-[var(--text-muted)]">Metode pengembalian untuk transaksi ini belum tersedia.</p>
          ) : <p className="text-sm text-[var(--text-muted)]">Pilih transaksi yang sudah lunas untuk melihat barang.</p>}
        </section>
      </div>
    </main>
  );
}
