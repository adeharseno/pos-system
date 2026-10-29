# Fase 4 — Finalisasi Penerimaan

## Audit dan keputusan kontrak

- Penerimaan existing `receive_product_stock` memvalidasi owner aktif, produk aktif, jumlah/batch/tanggal/harga, dan memakai advisory lock `73194001` yang sama dengan stock opname. RPC tersebut hanya menerima batch baru dan menolak batch existing.
- Kontrak RPC penerimaan lama dipertahankan. Finalisasi memanggilnya untuk batch baru; penambahan ke batch existing dilakukan di transaksi finalisasi dengan validasi yang sama dan biaya rata-rata tertimbang atas stok tersisa. Baris dengan produk/batch/expiry sama dalam satu invoice digabung untuk penambahan stok, tetapi sumber tiap item tetap dicatat.
- Jumlah unit dasar = jumlah satuan diterima × konversi snapshot. Biaya unit dasar = biaya per satuan / konversi, dibulatkan dua desimal mengikuti schema harga existing. Biaya asli per satuan dan konversi tetap tersimpan di item, sehingga pembulatan dapat diaudit. Biaya positif yang membulat menjadi nol ditolak, bukan diganti harga fiktif.
- Harga jual hanya diperbarui pada unit yang diterima. Harga modal/tax produk mengikuti baris produk yang terakhir disimpan; untuk satu unit yang muncul beberapa kali, harga jual mengikuti baris terakhir berdasarkan `updated_at`, lalu ID sebagai tie-break deterministik. Unit lain tidak diberi harga hasil tebakan.
- Edit Produk manual menggunakan UPDATE existing yang memperoleh row lock PostgreSQL. Finalisasi mengunci row produk/unit yang sama, sehingga penulis yang commit terakhir menentukan nilai terbaru. Konfirmasi lama dibatalkan bila harga sudah berubah sebelum finalisasi memperoleh lock.
- Checkout, stock opname, importer, form master, dan RPC stok existing tidak diubah.

## Migration dan transaksi

`supabase/migrations/0026_finalize_purchase_receiving.sql` menambahkan:

- Status invoice `completed` beserta waktu, actor, dan snapshot finalisasi immutable melalui jalur aplikasi.
- `purchase_invoice_receipts`: hubungan item → invoice → batch stok, kuantitas/biaya unit dasar, unit jual aktual, penanda pembuatan unit dasar, dan riwayat harga modal/pajak/harga jual sebelum serta sesudah penerimaan.
- Helper internal `purchase_receiving_plan`, RPC preview `preview_purchase_receiving`, dan RPC atomik `finalize_purchase_receiving`. Helper internal tidak dapat dipanggil langsung oleh browser maupun service role.

Urutan finalisasi dalam satu transaksi:

1. Verifikasi owner aktif, lock invoice, dan pemeriksaan kunci retry ledger Fase 2.
2. Periksa status Draft dan versi header; ambil lock penerimaan/opname existing dan tolak bila opname aktif.
3. Lock produk dengan NO KEY UPDATE, semua unit terkait, dan batch dalam urutan deterministik. Mode lock produk tetap kompatibel dengan KEY SHARE pada receiver lama. Lock batch mengikuti urutan checkout existing.
4. Validasi ulang seluruh snapshot, harga/margin, satuan dan konversi aktual, expiry pada tanggal bisnis Jakarta, batas kuantitas, serta token konfirmasi. Token mencakup header, seluruh item, dan harga master yang ditampilkan pada dialog.
5. Wajibkan persetujuan eksplisit jika subtotal barang berbeda dari Total Belanja invoice.
6. Buat batch baru melalui RPC existing atau tambah batch lama dengan weighted cost. Biaya gabungan memakai total biaya asli item / jumlah unit dasar, bukan hasil pembulatan per unit yang dikalikan ulang.
7. Buat/reuse unit dasar yang valid untuk snapshot tanpa unit jual, perbarui harga produk/unit, lalu catat setiap sumber penerimaan dan perubahan harga.
8. Tandai invoice Selesai dan simpan snapshot akhir serta ledger idempotency.

Tidak ada handler yang menelan kegagalan di tengah transaksi. Kegagalan pada tahap mana pun me-rollback batch, stok, pembuatan unit, harga, riwayat, status, dan ledger request. Retry sukses hanya mengembalikan hasil lama, termasuk jika ada edit harga manual yang commit sesudahnya.

## API, UI, dan file utama

- `GET /api/purchase-invoices/[id]/finalize`: preview terbaru dengan token konfirmasi.
- `POST /api/purchase-invoices/[id]/finalize`: versi, token, kunci retry, dan boolean persetujuan selisih; actor berasal dari sesi server. Semua endpoint memerlukan owner aktif dan mutation memeriksa Origin.
- `src/modules/purchasing/receiving-finalization.ts`: adapter RPC dan pembacaan riwayat penerimaan.
- `receiving-types.ts` dan `receiving-presentation.ts`: kontrak preview serta format uang dalam sen yang tetap akurat untuk total besar dan selisih negatif.
- `components/finalize-receiving-button.tsx`: tombol di bawah daftar barang dan dialog TailAdmin berisi nomor invoice, pemasok, jumlah baris/batch, total barang/invoice, selisih, checkbox persetujuan selisih, dan harga jual lama → baru.
- `components/receiving-completed-summary.tsx`: ringkasan read-only jumlah diterima, konversi, batch/expiry, dan riwayat harga.
- Workspace menonaktifkan finalisasi ketika masih ada perubahan barang yang belum disimpan atau mutation belum pasti. Token invalid mengharuskan pengguna memeriksa dialog baru. Respons tidak pasti mempertahankan kunci retry yang sama.
- Detail invoice Selesai menampilkan konfirmasi, ringkasan barang, dokumen, status pembayaran, dan tautan **Riwayat Pembelian** menuju daftar existing `/purchase-invoices`. Form edit header/item tidak dapat dibuka untuk invoice Selesai; server/RPC tetap menolak mutation.
- Daftar existing hanya disesuaikan label status Draft/Selesai. Tidak ada redesign halaman riwayat, form stok baru, atau pembayaran lanjutan.

## Hasil validasi

- `npm run typecheck`, `npm run lint`, `npm run build`: lulus.
- Tes aplikasi gabungan purchasing/catalog/auth/permission/cashier/checkout/receipt: **115 lulus**. Purchasing sendiri **15 lulus**.
- Tes database lokal invoice/item/master/supplier/ACL penerimaan: **54 assertion lulus**.
- `npm run test:purchasing:api`: lulus untuk regresi Fase 2–3 serta preview finalisasi, 401/403, validasi payload, dan penolakan saat opname aktif. Database lokal memiliki sesi opname existing; sesi itu tidak dibatalkan atau diubah untuk tes.
- `npm run test:purchasing:receiving`: lulus pada database lokal sementara dengan salinan schema tanpa data pengguna. Meliputi penerimaan normal, beberapa batch/produk, penggabungan batch, batch existing/weighted cost, master tanpa unit jual, konversi strip ke unit dasar, persetujuan selisih, opname aktif, permission, penguncian header/item setelah Selesai, retry identik, dua finalisasi bersamaan dengan kunci sama/berbeda, token stale setelah edit item/harga, dan urutan commit harga manual.
- Suite terisolasi sengaja memicu kegagalan saat riwayat penerimaan ditulis, setelah stok/harga/unit baru sempat dibuat dalam transaksi. Snapshot sebelum/sesudah identik: tidak ada perubahan parsial, dan invoice tetap Draft.
- Suite membuat transaksi penjualan melalui checkout existing sebelum penerimaan. Row transaksi, item penjualan, serta snapshot biaya batch penjualan lama tetap identik setelah seluruh finalisasi.
- `stock_receiving.test.sql` existing juga lulus (**12 assertion**) di database sementara tersebut. Database sementara dibuat/dihapus dengan nama acak yang divalidasi ketat; tidak menyalin data pengguna dan tidak mengakses host non-local.
- Tes render menguji disabled state finalisasi, format uang/selisih, dan ringkasan Selesai tanpa kontrol edit. `git diff --check` lulus.

## Keterbatasan dan batas fase

- Konfirmasi popup belum diperiksa melalui browser interaktif. Verifikasi UI menggunakan render markup; finalisasi normal, konkurensi dan rollback diuji pada database terisolasi. Endpoint pada database aplikasi lokal diuji untuk preview, validation/permission, dan blokir opname existing.
- Ketelitian biaya unit dasar tetap dua desimal sesuai schema existing. Snapshot biaya asli, konversi, serta biaya agregat batch disimpan untuk audit pembulatan.
- Riwayat Pembelian memakai daftar existing dengan batas 100 invoice terbaru. Redesign/pencarian/pagination riwayat dan pembayaran lanjutan tidak dikerjakan.

Branch tetap sama. Migration hanya diterapkan lokal. Tidak push, deploy, atau mengakses Production. Berhenti pada Fase 4.
