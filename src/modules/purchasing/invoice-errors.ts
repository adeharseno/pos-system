// Kept separate from shared domain errors so existing stock/product contracts stay unchanged.
export class PurchaseInvoiceError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

export function invoiceDatabaseError(error: { code?: string; message: string }): never {
  const messages: Record<string, [number, string]> = {
    INVOICE_ALREADY_COMPLETED: [409, "Penerimaan sudah Selesai. Buka detail invoice untuk melihat hasilnya."],
    INVOICE_RECEIVING_CHANGED: [409, "Data invoice, barang, atau harga sudah berubah. Periksa kembali dialog konfirmasi terbaru."],
    INVOICE_DIFFERENCE_NOT_CONFIRMED: [400, "Konfirmasi selisih total invoice sebelum menyelesaikan penerimaan."],
    INVOICE_EMPTY: [400, "Tambahkan barang sebelum menyelesaikan penerimaan."],
    INVOICE_UNIT_CHANGED: [409, "Satuan produk telah berubah. Periksa dan simpan ulang barang invoice."],
    BASE_COST_PRECISION: [400, "Harga modal unit dasar terlalu kecil untuk ketelitian dua desimal. Periksa harga dan satuan."],
    INVALID_RECEIVING_ITEM: [400, "Barang penerimaan tidak valid. Periksa jumlah, harga, batch, satuan, dan kedaluwarsa."],
    STOCK_OPNAME_IN_PROGRESS: [409, "Perhitungan stok sedang berlangsung. Selesaikan opname sebelum menerima barang."],
    PRODUCT_INACTIVE: [409, "Ada produk tidak aktif. Periksa produk pada invoice."],
    EXPIRED_BATCH: [400, "Ada batch kedaluwarsa. Periksa barang pada invoice."],
    INVALID_INVOICE_ITEM: [400, "Data barang tidak valid. Periksa harga, satuan, jumlah, batch, dan kedaluwarsa."],
    INVOICE_ITEM_NOT_FOUND: [404, "Barang invoice sudah dihapus atau tidak ditemukan."],
    INVOICE_ITEM_VERSION_CONFLICT: [409, "Barang sudah diubah pada tab lain. Periksa daftar terbaru; isian Anda tetap tersedia."],
    INVOICE_VERSION_CONFLICT: [409, "Invoice sudah diubah. Muat ulang halaman sebelum mengedit kembali."],
    INVOICE_REQUEST_CONFLICT: [409, "Permintaan sebelumnya berbeda. Muat ulang halaman dan periksa invoice."],
    PURCHASE_INVOICE_NOT_FOUND: [404, "Invoice tidak ditemukan."],
    INVOICE_NOT_DRAFT: [409, "Hanya invoice Draft yang dapat diubah."],
    INVALID_SUPPLIER: [400, "Pemasok tidak tersedia. Pilih pemasok lain."],
    INVALID_PURCHASE_INVOICE: [400, "Data invoice atau pembayaran tidak valid."],
    INVALID_INVOICE_PAYMENT: [400, "Pembayaran tidak valid. Periksa jumlah dan tanggal pembayaran."],
    INVOICE_PAYMENT_EXCEEDS_BALANCE: [409, "Jumlah pembayaran melebihi sisa hutang terbaru. Muat ulang halaman dan periksa kembali."],
    INVOICE_DOCUMENT_NOT_FOUND: [400, "Dokumen belum tersedia. Unggah kembali dokumen."],
    FORBIDDEN: [403, "Anda tidak memiliki akses untuk menyimpan invoice."],
  };
  if (error.code === "23505" && error.message.includes("purchase_invoices_supplier_number_key")) throw new PurchaseInvoiceError("DUPLICATE_PURCHASE_INVOICE", 409, "Nomor invoice sudah digunakan pada pemasok ini.");
  if (error.code === "23505" && error.message.includes("purchase_invoice_requests_pkey")) throw new PurchaseInvoiceError("INVOICE_REQUEST_CONFLICT", 409, messages.INVOICE_REQUEST_CONFLICT[1]);
  for (const [code, [status, message]] of Object.entries(messages)) if (error.message === code) throw new PurchaseInvoiceError(code, status, message);
  throw new PurchaseInvoiceError("INVOICE_SAVE_UNCERTAIN", 500, "Hasil penyimpanan belum dapat dipastikan. Coba simpan kembali dengan data yang sama atau periksa daftar invoice.");
}
