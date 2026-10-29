import { Card, CardContent } from "@/modules/ui/components";
import { formatInvoiceAmount } from "../invoice-presentation";
import type { InvoiceItem } from "../invoice-item-repository";
import type { Database } from "@/types/database.types";
type Receipt = Database["public"]["Tables"]["purchase_invoice_receipts"]["Row"];
export function ReceivingCompletedSummary({ items, receipts }: { items: InvoiceItem[]; receipts: Receipt[] }) {
  return <section className="space-y-5"><h2 className="text-xl font-semibold">Ringkasan Penerimaan Selesai</h2><p className="text-base text-gray-600">Rincian dan riwayat harga ini hanya dapat dilihat. Pembayaran dan dokumen invoice tetap tersimpan.</p>{items.map(item => {
    const receipt = receipts.find(row => row.item_id === item.id);
    return <Card key={item.id}><CardContent className="space-y-4 text-base"><h3 className="break-words text-lg font-semibold">{item.product_name_snapshot}</h3><p>SKU: {item.sku_snapshot}</p><p className="break-words">Batch: {item.batch_number} · Kedaluwarsa: {item.expired_date}</p><p>Diterima: {item.quantity} {item.unit_name_snapshot}{receipt ? ` = ${receipt.quantity_base} ${item.base_unit_snapshot}` : ""}</p><p>Subtotal pembelian: <strong>{item.subtotal === null ? "Belum tersedia" : formatInvoiceAmount(item.subtotal)}</strong></p>{receipt ? <div className="space-y-2 rounded-lg bg-gray-50 p-4"><p>Harga modal unit dasar: {receipt.previous_cost_price === null ? "Belum diatur" : formatInvoiceAmount(receipt.previous_cost_price)} → {formatInvoiceAmount(receipt.new_cost_price)}</p><p>Harga jual / {item.unit_name_snapshot}: {receipt.previous_selling_price === null ? "Belum diatur" : formatInvoiceAmount(receipt.previous_selling_price)} → {formatInvoiceAmount(receipt.new_selling_price)}</p></div> : null}</CardContent></Card>;
  })}</section>;
}
