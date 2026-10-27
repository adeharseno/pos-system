# Dashboard cleanup dan desain ulang transaksi

Pekerjaan ini dilakukan langsung pada branch lokal saat ini. Perubahan dari
tahap sebelumnya dipertahankan.

## Hasil

1. Bagian tindakan cepat di beranda dihapus beserta containernya. Beranda
   Pemilik langsung dimulai dari Ringkasan Penjualan, filter tanggal, empat
   metrik, Penjualan Bulanan dan Produk Terlaris. Perhitungan dan grafik tetap.
2. Beranda ditambahkan sebagai item pertama Operasional, diikuti Penjualan
   Baru dan Transaksi. Ikon rumah mengikuti ikon yang ada. Active state bekerja
   untuk `/dashboard` pada sidebar desktop dan mobile. Retur tidak ditambahkan.
3. `/transactions` menggunakan komponen form/kartu bersama, label terlihat,
   tabel desktop enam kolom dan kartu pada tablet/mobile. Kasir tetap terlihat
   di bawah nomor transaksi sehingga tidak memerlukan kolom tambahan.
4. Detail transaksi dibagi menjadi informasi transaksi, daftar barang dan
   pembayaran. Kuantitas, harga jual, total tersimpan, pajak, uang diterima,
   kembalian, serta status retur ditampilkan tanpa harga modal/HPP/margin.
5. Status memakai badge berwarna dengan teks. Kontrol utama minimal 48–52 px,
   teks isi minimal 16 px, kontras jelas, dan label tindakan lengkap.

## Perilaku yang dipertahankan

- Pencarian nomor transaksi, filter tanggal/metode/status, pengurutan dari
  repository, pagination 20 baris dan navigasi detail tetap memakai parser
  dan query yang sama. Pilihan metode filter tetap Tunai/QRIS; tidak ada filter
  baru. Transfer Bank hanya ditampilkan sebagai label jika ada data aktualnya.
- Filter dibawa ke pagination dan tautan coba lagi. Saat query gagal, form
  tetap dirender dengan filter yang dimasukkan. Halaman lanjutan yang gagal
  juga menawarkan kembali ke halaman pertama dengan filter tetap utuh.
- Detail menggunakan read model dan perhitungan sisa retur yang sama. Retur
  sebagian/penuh tetap diperhitungkan. Tautan Retur Barang mengikuti
  `canStartReturn` yang sudah ada.
- Lihat / Cetak Struk membuka halaman struk yang sudah ada. Source dan layout
  struk cetak tidak diubah.
- Tombol konfirmasi hanya untuk QRIS menunggu pembayaran. Pembatalan memakai
  API yang ada: pembayaran elektronik lunas dan transaksi dengan retur tidak
  menawarkan void. Aturan backend tetap menjadi keputusan akhir.
- Pembatalan memakai dialog konfirmasi dan alasan wajib. Konfirmasi QRIS juga
  meminta pengguna memastikan pembayaran sudah diterima.
- Permintaan ganda diblokir selama proses. Error tidak menghapus alasan yang
  dimasukkan. Jika hasil belum pasti, tindakan tidak otomatis diulang; pengguna
  harus memeriksa status melalui endpoint baca yang sudah ada. Pesan sukses
  ditampilkan dan halaman disegarkan setelah server mengonfirmasi hasilnya.
- Guard `requirePosOperator` tetap: Pemilik/Kasir boleh mengakses; Staf tidak
  memperoleh data transaksi. API, RPC, otorisasi dan perhitungan tidak diubah.

## File yang diubah dalam kelanjutan ini

- `src/app/(protected)/dashboard/page.tsx`
- `src/modules/ui/app-shell.tsx`
- `src/modules/ui/icons.tsx`
- `src/app/(protected)/transactions/page.tsx`
- `src/app/(protected)/transactions/loading.tsx` (baru)
- `src/app/(protected)/transactions/error.tsx` (baru)
- `src/app/(protected)/transactions/[id]/page.tsx`
- `src/app/(protected)/transactions/[id]/loading.tsx` (baru)
- `src/app/(protected)/transactions/[id]/error.tsx` (baru)
- `src/modules/sales/components/transaction-presentation.tsx` (baru)
- `src/modules/sales/components/transaction-actions.tsx` (baru)
- `src/modules/sales/components/transaction-loading.tsx` (baru)
- `src/modules/sales/transaction-detail-ui.ts` (baru, visibilitas tindakan UI)
- `src/modules/sales/transaction-detail-ui.test.ts` (baru)
- `supabase/tests/dashboard-ui.cjs`
- `docs/ui-sederhana-60-plus.md`
- `docs/dashboard-transactions-redesign.md` (baru)

Tidak ada perubahan API/RPC/migrasi/query database, autentikasi, permission
backend, atau business logic Produk/Persediaan/Laporan/Kasir. Tidak ada
dependency baru, data dummy, perubahan Supabase produksi, push, atau deployment.

## Validasi

- `npm run typecheck`: lulus.
- `npm run lint`: lulus.
- `npm run build`: lulus.
- 62 tes transaksi, QRIS, struk, retur, autentikasi dan permission: lulus.
- Pemeriksaan HTTP beranda terautentikasi: empat metrik masih sesuai `/reports`
  untuk empat periode, container tindakan cepat tidak dirender, dan Beranda
  memiliki active state di sidebar.
- Pemeriksaan HTTP transaksi terautentikasi: empty state, pilihan filter,
  nilai input yang dipertahankan, pemulihan ke halaman pertama setelah error,
  detail dengan UUID tidak valid/tidak ditemukan, dan redirect tanpa sesi lulus.
- Database lokal saat pemeriksaan memiliki nol transaksi. Tidak ada transaksi
  dummy dibuat. Tabel berisi data, detail transaksi aktual, mutasi konfirmasi/
  pembatalan dan alur cetak/retur tidak diuji end-to-end dalam sesi ini.
- Inventaris browser sesi kosong. Pemeriksaan visual desktop/mobile, zoom,
  keyboard dan interaksi dialog masih memerlukan browser terhubung.

Perintah tes terkait:

```text
npx tsx --test src/modules/transaction-history.test.ts src/modules/sales/transaction-detail-ui.test.ts src/modules/qris-payment.test.ts src/modules/receipt.test.ts src/modules/returns/return-quantity.test.ts src/modules/auth/auth.test.ts src/modules/auth/permissions.test.ts
```
