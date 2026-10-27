# Desain ulang Daftar Barang dan Detail Barang

Perubahan UI yang diminta sebelum penyesuaian importer tetap dipertahankan pada
branch yang sama. Form Tambah/Edit, Inventory, Reports, Employees dan Cashier
tidak didesain ulang.

## Daftar Barang

- Heading Daftar Barang dan tombol Tambah Barang khusus Pemilik.
- Tabel desktop lima kolom: Barang, Harga Jual, Stok Tersedia, Status, Detail.
  Nama/harga lebih besar; SKU, kategori, resep dan jumlah satuan tetap tersedia.
- Kartu besar yang seluruhnya dapat diklik pada tablet/mobile, dengan status
  aktif/nonaktif dan stok habis berlabel teks.
- Form pencarian nama/SKU, filter status/resep, pagination dan query tetap.
  Kontrol berlabel dan memiliki tinggi minimal 52 px. Filter tetap tersedia
  saat query gagal; tautan pemulihan halaman mempertahankan filter.
- Cari Barcode membuka dialog memakai endpoint baca `/api/products?barcode=`
  yang sudah ada, kemudian membuka detail barang. Endpoint ini hanya memberikan
  ID barang aktif; barcode barang nonaktif memberi arahan untuk mencari melalui
  nama/SKU dengan status Nonaktif. Query daftar/API tidak diperluas.
- Kategori, subkategori, pajak dan impor ditempatkan dalam Pengaturan Barang
  yang bisa dibuka, hanya untuk Pemilik. Semua rute lama dipertahankan.

## Detail Barang

- Informasi Barang, Harga Jual, Stok Tersedia, Satuan & Barcode, dan Informasi
  Tambahan bila datanya tersedia. Field kosong/placeholder tidak diulang.
- Rincian stok per batch dan informasi harga modal/margin bisa dibuka melalui
  bagian sekunder. Tanggal menggunakan Asia/Jakarta.
- Data tersedia, minimum stok, harga, pajak, konversi satuan dan margin tetap
  berasal dari read model/aturan yang ada. Tidak ada perhitungan harga/stok baru.
- Guard Pemilik/Kasir dan `canViewSensitiveProductPricing` dipertahankan.
  `getAdminProduct(id, false)` tetap digunakan untuk pengguna tanpa hak harga
  sensitif. Harga modal, margin dan modal batch juga tidak dirender pada markup
  non-owner. Objek produk lengkap tidak diberikan kepada komponen client.
- Tautan ubah barang, tambah/ubah satuan dan penerimaan stok, serta tindakan
  nonaktif melalui konfirmasi yang sudah ada tetap bekerja pada rute/API lama.

## File terkait

- `src/app/(protected)/products/page.tsx`
- `src/app/(protected)/products/[id]/page.tsx`
- `src/modules/catalog/components/product-presentation.tsx`
- `src/modules/catalog/components/product-detail-sections.tsx`
- `src/modules/catalog/components/product-barcode-lookup.tsx`
- `src/modules/catalog/components/deactivate-product-button.tsx` (copy Barang)
- `src/modules/catalog/product-detail-presentation.test.tsx`
- `docs/product-list-detail-redesign.md`

## Validasi

Typecheck, lint dan build lulus bersama perubahan importer. 41 tes gabungan
produk, impor dan otorisasi lulus. Tes rendering memeriksa markup Kasir/Staf
tidak berisi harga modal, margin atau modal batch meskipun fixture memuat data
sensitif. HTTP lokal memverifikasi daftar kosong, filter, tautan pengelolaan,
barcode tidak ditemukan, pemulihan halaman, UUID tidak valid dan redirect login.

Browser sesi tidak terhubung. Visual desktop/mobile dan interaksi dialog belum
diperiksa di browser. Database lokal kosong sehingga detail produk aktual dan
aksi edit/nonaktif tidak diuji end-to-end. Fixture rendering hanya berada dalam
memori tes, tidak dibuat sebagai data aplikasi.

Tidak ada perubahan query produk, database, migrasi, API CRUD produk, form
Tambah/Edit atau dependency. Penyesuaian importer yang diminta kemudian
didokumentasikan di [laporan importer](product-import-enriched.md).
