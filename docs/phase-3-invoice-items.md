# Fase 3 — Produk dalam Invoice Draft

## Audit dan kontrak

- Fase 2 menyediakan header invoice, pembayaran awal, dokumen private, version check, lock per invoice, serta ledger request untuk retry. Belum ada tabel item invoice.
- Produk, unit jual, dan batch stok existing digunakan sebagai sumber referensi baca. Pencarian memakai `listAdminProducts` dan validasi pencarian existing; detail harga memakai `getAdminProduct` dengan akses owner.
- Perhitungan memakai `sellingPriceFromCost`, `marginFromSellingPrice`, dan `formatMarginPercent` existing. Harga yang dihitung dari margin dibulatkan ke Rupiah seperti helper existing; input harga jual manual menghitung margin kembali. Margin kosong diperbolehkan jika biaya nol sehingga persentase tidak dapat dihitung.
- Harga modal master adalah per unit dasar. Pada satuan penerimaan dengan konversi lebih besar, referensi harga modal dikalikan konversi. Harga dan jumlah snapshot item selalu per satuan yang dipilih.
- Subtotal pembelian = harga modal × jumlah × (1 + pajak/100), dibulatkan dua desimal per baris. Harga jual dan margin tidak menambah subtotal pembelian. Total barang dan selisih dihitung dalam sen menggunakan BigInt; Total Belanja header tidak berubah otomatis.

## Migration dan backend

`supabase/migrations/0025_purchase_invoice_items.sql` menambah satu tabel `purchase_invoice_items` dan satu RPC `write_purchase_invoice_item`.

Tabel menyimpan snapshot identitas/SKU produk, nama satuan, konversi, harga modal, pajak, margin, harga jual, mode perhitungan, jumlah, batch, dan kedaluwarsa. Subtotal dihitung database. Hapus menggunakan soft delete agar retry lama tidak menghidupkan kembali baris yang sudah dihapus.

RPC menggunakan lock invoice dan ledger request Fase 2, ID item dari klien, kunci retry, serta versi per item. Retry identik tidak menambah baris; request yang diubah atau edit versi lama ditolak. Header memiliki versi sendiri sehingga penambahan item tidak membatalkan edit header yang tidak berkaitan. Identitas produk/satuan dan konversi diambil database, bukan dipercaya dari input klien.

Master tanpa unit jual memakai ID unit NULL, nama unit dasar dan konversi 1 sebagai snapshot invoice saja. Harga modal/jual yang belum tersedia tetap kosong di form dan wajib diisi dengan angka yang valid. Tidak ada unit, harga, atau stok fiktif yang dibuat.

Endpoint tambahan, seluruhnya `owner_admin` aktif:

- `GET/POST /api/purchase-invoices/[id]/items`
- `PATCH/DELETE /api/purchase-invoices/[id]/items/[itemId]`
- `GET /api/purchase-invoices/[id]/products?q=...`
- `GET /api/purchase-invoices/[id]/products/[productId]`

Input server memvalidasi harga nonnegatif, pajak 0–100%, margin, satuan milik produk, jumlah integer positif beserta batas konversi ke unit dasar, nomor batch, tanggal kedaluwarsa valid/tidak lampau, dan konfirmasi kedaluwarsa ulang. Subtotal dibatasi rentang uang invoice. Mutation memeriksa Origin. Browser tidak memiliki hak menulis tabel atau memanggil RPC langsung.

Kasus batas pembulatan floating point pada helper lama juga diuji: biaya 12,50, margin 16%, pajak 0 menghasilkan harga 14 menurut helper existing. Validasi SQL mengikuti hasil tersebut, tanpa mengubah kontrak pricing existing.

Migration hanya diterapkan lokal. Tidak ada perubahan RPC stok, checkout, createProduct, form Master Produk, maupun harga master/unit jual.

## UI dan file utama

- Detail invoice menambahkan **Lanjut Isi Barang** menuju `/purchase-invoices/[id]/items`.
- `src/modules/purchasing/components/invoice-items-workspace.tsx`: panel invoice aktif di kiri pada layar lebar, kartu atas pada mobile/tablet, pencarian nama/SKU, pembanding harga/kedaluwarsa lama, form snapshot, daftar barang/batch, subtotal, total, dan selisih.
- Panel invoice membuka popup dengan `InvoiceForm` Fase 2. Callback simpan memperbarui header di tempat, tanpa navigasi atau refresh workspace yang menghapus isian barang.
- `Modal` existing mendapat opsi `keepMounted`; popup mempertahankan DOM form saat ditutup. Perilaku modal existing tetap sama jika opsi tidak dipakai.
- Memilih satuan memuat harga referensi untuk satuan itu; mengubah harga modal/pajak/margin/harga jual menggunakan helper existing. Kedaluwarsa sebelumnya tidak pernah otomatis mengisi tanggal baru. Setiap tambah/edit wajib mengonfirmasi ulang kemasan.
- **Tambah Produk Baru** membuka alur master-only existing di tab baru. Setelah disimpan, cari ulang nama/SKU; constraint SKU existing mencegah duplikasi SKU.
- **Tambahkan ke Invoice**, **Edit Barang**, **Simpan Perubahan**, **Batal Edit**, dan **Hapus** menggunakan kontrol TailAdmin besar. Penggantian produk atau pembatalan edit meminta konfirmasi jika ada isian belum disimpan.
- Hasil mutation yang tidak pasti mempertahankan payload dan kunci retry yang sama; form dikunci sampai retry aman. Konflik edit memperbarui daftar dari server, tetapi tidak otomatis membuang isian pengguna.

## Validasi

- Typecheck, lint, dan build: lulus.
- Tes aplikasi purchasing + catalog + auth/permission + cashier: **80 lulus**; purchasing sendiri **12 lulus**.
- Database lokal item invoice, header invoice, master-only, supplier: **50 assertion lulus**, termasuk **20 assertion khusus item**.
- `npm run test:purchasing:api`: lulus. Suite Fase 2 tetap dijalankan, ditambah pencarian nama/SKU, referensi harga/expiry, master tanpa harga/unit, tambah/edit/hapus, batch berbeda, retry serentak, konflik edit serentak, penolakan input/permission, persistence GET dan render halaman setelah refresh, serta Total Belanja header tetap sama.
- Snapshot seluruh row `products`, `product_units`, dan `product_batches` identik sebelum/sesudah operasi item, termasuk harga kasir. Fixture tes dibersihkan; script menolak service non-local.
- Tes render workspace memeriksa panel/kartu invoice, daftar batch, total/selisih, ketiadaan finalisasi, dan DOM popup yang tetap mounted saat ditutup.
- `git diff --check`: lulus.

## Keterbatasan dan batas fase

- Browser terhubung tidak tersedia (`cua.listBrowsers()` kosong), sehingga perilaku interaktif popup dan tampilan perangkat mobile belum diperiksa di browser. Verifikasi memakai unit test, render markup, HTTP halaman, API, dan database.
- Pencarian menampilkan maksimal 20 hasil; gunakan nama/SKU lebih spesifik bila perlu.
- Draft yang sudah disimpan dipulihkan dari server saat halaman dibuka kembali. Isian barang yang belum disimpan dipertahankan saat popup dibuka/ditutup/disimpan, tetapi belum di-autosave untuk refresh penuh browser.
- Finalisasi, penerimaan stok, pembuatan batch stok, pembaruan harga master, dan proses Fase 4 belum diimplementasikan.

Branch tetap sama. Tidak push, deploy, atau mengakses Production. Berhenti pada Fase 3.
