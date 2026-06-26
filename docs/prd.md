# PRD — Sistem POS Apotek (Pilot 1)

> Sumber: PRD_POS_Apotek_Pilot1.docx (v1.0, 22 Juni 2026). Untuk turunan teknis, lihat file lain di folder `docs/` ini.


**PRODUCT REQUIREMENTS DOCUMENT**

**Sistem Point of Sale (POS) untuk Apotek**

*Pilot 1 — Versi Sederhana, Biaya Minimal*

Tech Stack: Next.js  ·  Supabase  ·  Vercel

Versi 1.0  |  22 Juni 2026

*Status: Draft untuk Review*

# Daftar Isi

# 1. Executive Summary

## 1.1 Latar Belakang

Dokumen ini menjabarkan kebutuhan produk untuk Pilot 1 dari sistem Point of Sale (POS) yang dirancang khusus untuk operasional apotek. Pilot 1 difokuskan untuk memvalidasi fondasi inti — kasir, manajemen produk farmasi (multi-unit, multi-batch, FEFO), dan laporan dasar — dengan pendekatan teknis yang sederhana, berbiaya minimal, dan cepat untuk dikembangkan serta diuji di lapangan.

Dibandingkan rencana awal yang menggunakan backend Golang dan integrasi payment gateway penuh, Pilot 1 mengambil pendekatan yang jauh lebih ringkas: seluruh aplikasi (frontend dan backend) dibangun dalam satu codebase menggunakan Next.js, memanfaatkan Supabase sebagai database, autentikasi, dan penyimpanan file, serta di-hosting di Vercel tanpa biaya bulanan pada skala pilot. Pembayaran QRIS menggunakan gambar QRIS statis yang diunggah oleh pemilik usaha, dikonfirmasi secara manual oleh kasir — bukan melalui integrasi payment gateway otomatis.

Pendekatan ini dipilih secara sadar untuk mempercepat validasi konsep dengan biaya dan kompleksitas serendah mungkin. Fitur-fitur yang menambah kompleksitas signifikan namun belum terbukti dibutuhkan pada tahap ini — seperti approval workflow berjenjang, integrasi payment gateway, Purchase Order formal, dan offline mode — disisihkan ke pilot/fase berikutnya, dan strategi migrasinya dibahas pada Bagian 9.

## 1.2 Tujuan Pilot 1

- Memvalidasi kelayakan operasional sistem kasir untuk apotek dengan kompleksitas farmasi inti: multi-unit (kotak/strip/tablet), multi-batch dengan FEFO, dan klasifikasi obat berdasarkan kewajiban resep.

- Membuktikan bahwa arsitektur berbiaya rendah (Next.js + Supabase + Vercel) cukup untuk operasional kasir harian sebuah apotek skala kecil-menengah.

- Menyediakan visibilitas dasar atas stok, penjualan, dan keuangan tanpa kerumitan workflow approval atau integrasi pihak ketiga.

- Mengumpulkan masukan nyata dari penggunaan harian sebelum berinvestasi pada kompleksitas tambahan (payment gateway, multi-cabang, payroll, CRM) di pilot/fase berikutnya.

## 1.3 Ruang Lingkup Pilot 1

Pilot 1 mencakup tiga modul fitur:

- Kasir (Point of Sale) — multi-unit, validasi resep, FEFO otomatis, pembayaran cash & QRIS statis (konfirmasi manual), cetak struk, dan void transaksi sederhana.

- Manajemen Produk & Stok — kategori hierarkis, multi-batch tracking, lokasi rak penyimpanan, stock opname sederhana, dan retur per-batch.

- Laporan & Keuangan — laporan penjualan berkala, laba-rugi, dan perhitungan pajak (PPN).

Ditambah kapabilitas operasional dasar: manajemen karyawan sederhana dan dua peran akses (Owner/Admin dan Kasir).

## 1.4 Di Luar Ruang Lingkup Pilot 1

Hal-hal berikut secara sadar tidak disertakan pada Pilot 1, termasuk skema/desainnya — bukan sekadar implementasinya — karena dianggap menambah kompleksitas yang belum terbukti perlu pada tahap validasi awal:

- Integrasi payment gateway (Midtrans atau lainnya) — QRIS pada Pilot 1 berupa gambar statis, konfirmasi pembayaran manual oleh kasir. Lihat Bagian 4.2.5 dan Bagian 9 untuk pertimbangan migrasi ke Pilot 2.

- Approval workflow berjenjang untuk void transaksi, retur, dan stock opname — pada Pilot 1, aksi-aksi ini cukup dicatat dengan alasan dan pelaku, tanpa mekanisme pengajuan-tinjauan-keputusan formal.

- Purchase Order (PO) ke Goods Receipt (GR) — termasuk skema data-nya. Input stok tetap manual sepenuhnya.

- Strategi dan implementasi offline mode — pada Pilot 1, aplikasi diasumsikan selalu memiliki koneksi internet, konsisten dengan kebutuhan dasar arsitektur serverless yang dipilih.

- Role-Based Access Control granular per-aksi — disederhanakan menjadi dua peran tetap: Owner/Admin dan Kasir.

- Payroll dan Program Loyalitas (CRM) — modul ini berdiri independen dan tidak memengaruhi validasi fondasi inti pada Pilot 1.

- Multi-cabang dan kanal penjualan online — termasuk flag available_online/available_offline yang sebelumnya direncanakan; pada Pilot 1 struktur ini tidak disertakan untuk menjaga skema data tetap sederhana.

***Catatan: ****Berbeda dengan pendekatan dokumen sebelumnya yang menyiapkan skema data untuk fitur yang ditunda, Pilot 1 secara sengaja TIDAK menyiapkan skema untuk hal-hal di atas. Filosofinya: skema yang disiapkan terlalu awal untuk kebutuhan yang belum pasti bentuknya berisiko salah desain dan perlu diubah lagi nanti. Lebih efisien mendesain skema tersebut saat kebutuhan dan konteksnya sudah jelas di pilot/fase berikutnya.*

# 2. Tech Stack & Arsitektur

## 2.1 Komponen Teknologi

| **Layer** | **Teknologi** | **Keterangan** |
| --- | --- | --- |
| Frontend | Next.js (React) | Antarmuka kasir, dashboard admin, dan laporan |
| Backend | Next.js API Routes | REST API & business logic, berjalan sebagai serverless function dalam satu codebase dengan frontend |
| Database | PostgreSQL (Supabase) | Database relasional terkelola, mendukung transaksi ACID untuk stok & keuangan |
| Autentikasi | Supabase Auth | Login kasir/admin, sesi tahan lama dengan refresh token otomatis |
| File Storage | Supabase Storage | Penyimpanan foto resep dan gambar produk |
| Hosting | Vercel | Hosting frontend dan backend dalam satu deployment, tanpa biaya bulanan pada skala pilot |
| Print Struk | Thermal printer (ESC/POS) via WebUSB/lokal service | Cetak struk dari browser kasir |
| Barcode Scanner | USB/Bluetooth HID scanner | Terbaca sebagai input keyboard, tidak perlu driver khusus |

## 2.2 Keputusan Arsitektur Kunci

### 2.2.1 Next.js Full-Stack di Atas Vercel

Pilot 1 menggunakan Next.js sebagai satu-satunya codebase untuk frontend maupun backend, memanfaatkan API Routes/Route Handlers bawaan Next.js sebagai layer backend. Pendekatan ini dipilih murni untuk efisiensi biaya dan kecepatan pengembangan pada tahap validasi:

- Tidak ada server terpisah yang perlu disewa atau dikelola — frontend dan backend di-deploy sebagai satu aplikasi di Vercel.

- Vercel menyediakan tingkatan gratis (Hobby) yang mencukupi untuk kebutuhan satu outlet dengan satu atau beberapa kasir.

- Setiap endpoint backend berjalan sebagai serverless function — dipanggil saat ada request, lalu berhenti. Tidak ada proses yang harus terus hidup, yang konsisten dengan keputusan untuk tidak menyertakan payment gateway maupun webhook pada Pilot 1.

***Catatan: ****Konsekuensi teknis: serverless function memiliki batas waktu eksekusi (sekitar 10 detik pada tingkatan gratis Vercel). Untuk kebutuhan Pilot 1 — transaksi kasir, CRUD produk, dan laporan dasar — ini lebih dari cukup. Hal ini perlu ditinjau ulang jika di pilot berikutnya terdapat proses yang berjalan lama (misalnya laporan dengan kalkulasi sangat besar).*

### 2.2.2 Supabase sebagai Database, Auth, dan Storage Terpadu

- Database: PostgreSQL terkelola, dapat diakses langsung dari Next.js API Routes.

- Autentikasi: Supabase Auth digunakan untuk login Owner/Admin dan Kasir. Secara default, sesi berlangsung tanpa batas waktu tertentu — access token diperbarui otomatis di belakang layar oleh client Supabase setiap kurang lebih satu jam, sehingga kasir tidak perlu login ulang sepanjang hari kerja selama aplikasi tetap terbuka.

- Storage: digunakan untuk menyimpan foto resep (saat transaksi memerlukan validasi resep) dan gambar produk.

***Catatan: ****Implementasi perlu memperhatikan: (1) memasang listener perubahan status autentikasi di level aplikasi root agar refresh token berjalan konsisten meski kasir berpindah halaman, dan (2) selalu menginisialisasi client Supabase di dalam request handler API Route — bukan di luar/level modul — untuk mencegah data sesi satu pengguna tercampur dengan pengguna lain akibat sifat serverless function di Vercel yang dapat menggunakan ulang instance proses.*

### 2.2.3 QRIS Statis dengan Konfirmasi Manual

Berbeda dari rencana sebelumnya yang menggunakan QRIS dinamis melalui payment gateway, Pilot 1 menggunakan pendekatan QRIS statis:

- Pemilik usaha mengunggah satu gambar QRIS statis (didapat dari rekening merchant QRIS miliknya) melalui halaman pengaturan, disimpan di Supabase Storage.

- Saat kasir memilih metode pembayaran QRIS pada transaksi, sistem menampilkan gambar QRIS statis tersebut dalam bentuk popup/modal di layar kasir untuk dipindai pelanggan.

- Karena tidak ada integrasi otomatis dengan penyedia QRIS, kasir harus mengonfirmasi pembayaran secara manual (misalnya setelah melihat notifikasi pembayaran masuk di aplikasi/perangkat penyedia QRIS milik apotek) dengan menekan tombol "Konfirmasi Pembayaran Diterima" sebelum transaksi diselesaikan.

***Catatan: ****Pendekatan ini memindahkan tanggung jawab verifikasi pembayaran dari sistem ke kasir secara manual. Risiko: kasir dapat menyelesaikan transaksi sebelum pembayaran benar-benar diterima (baik karena kelalaian maupun kecurangan). Mitigasi yang disarankan: catat waktu konfirmasi pada setiap transaksi QRIS untuk keperluan audit, dan pertimbangkan rekonsiliasi berkala antara catatan transaksi QRIS di sistem dengan mutasi rekening/aplikasi merchant QRIS yang sebenarnya. Pilot 2 dapat menggantikan mekanisme ini dengan QRIS dinamis melalui payment gateway untuk konfirmasi otomatis — lihat Bagian 9.*

### 2.2.4 Manajemen Stok Berbasis Batch dan FEFO

Stok tidak disimpan sebagai satu angka per produk, melainkan sebagai kumpulan batch (lot) dengan tanggal kedaluwarsa masing-masing. Saat transaksi penjualan terjadi, sistem secara otomatis mengambil stok dari batch dengan tanggal kedaluwarsa paling dekat (FEFO — First Expired First Out), tanpa memerlukan pemilihan manual oleh kasir kecuali pada kasus khusus. Pendekatan ini dipertahankan dari desain sebelumnya karena merupakan kebutuhan inti farmasi yang tidak bisa disederhanakan tanpa mengurangi nilai utama produk.

# 3. Database Schema Overview

Bagian ini menjelaskan entitas-entitas inti dan relasinya secara konseptual untuk Pilot 1. Dibandingkan desain sebelumnya, skema ini disederhanakan secara sengaja — tabel-tabel yang hanya relevan untuk fitur di luar ruang lingkup Pilot 1 (lihat Bagian 1.4) tidak disertakan, agar database tetap ringkas dan mudah dikelola pada tahap validasi awal. Skema detail (tipe data, index, constraint) akan disusun pada tahap technical design terpisah.

## 3.1 Entitas Inti: Produk

### 3.1.1 Tabel products

Tabel ini menyimpan definisi dasar setiap produk. Detail satuan, harga per satuan, dan stok per-batch disimpan pada tabel terpisah agar satu produk dapat memiliki banyak satuan jual dan banyak batch tanpa duplikasi data.

| **Field** | **Tipe** | **Keterangan** |
| --- | --- | --- |
| id | UUID | Primary key |
| sku | String | Kode produk internal, unik |
| name | String | Nama produk |
| generic_name | String | Nama generik obat (misal: "Paracetamol") |
| description | Text | Deskripsi/keterangan produk (opsional) |
| manufacturer | String | Produsen/pabrikan (opsional) |
| image_url | String | URL foto produk di Supabase Storage (opsional) |
| category_id | UUID (FK) | Relasi ke kategori |
| subcategory_id | UUID (FK) | Relasi ke subkategori |
| drug_classification | Enum | otc / otc_limited / prescription_required |
| requires_prescription | Boolean | Flag turunan dari drug_classification |
| base_unit | String | Satuan dasar stok, misal "tablet" |
| cost_price | Decimal | Harga modal per base unit |
| tax_rate | Decimal | Persentase pajak (PPN) yang berlaku |
| is_taxable | Boolean | Apakah produk kena pajak |
| storage_location_id | UUID (FK) | Relasi ke lokasi rak penyimpanan |
| minimum_stock | Integer | Ambang batas stok minimum untuk alert restock |
| default_supplier_id | UUID (FK) | Relasi ke supplier utama |
| is_active | Boolean | Status aktif/discontinued |
| created_at / updated_at | Timestamp | Audit trail |

***Catatan: ****Dibandingkan desain sebelumnya, field outlet_id, available_online, dan available_offline tidak disertakan pada Pilot 1 karena hanya relevan untuk kebutuhan multi-cabang dan kanal online yang berada di luar ruang lingkup pilot ini (lihat Bagian 1.4).*

### 3.1.2 Tabel product_units (multi-unit per produk)

Menyimpan seluruh level satuan jual untuk satu produk (contoh: Kotak, Strip, Tablet), masing-masing dengan harga jual dan barcode sendiri.

| **Field** | **Tipe** | **Keterangan** |
| --- | --- | --- |
| id | UUID | Primary key |
| product_id | UUID (FK) | Relasi ke produk |
| unit_name | String | Contoh: "Kotak", "Strip", "Tablet" |
| conversion_to_base | Integer | Jumlah base unit dalam 1 unit ini (misal 1 kotak = 50 tablet) |
| selling_price | Decimal | Harga jual khusus untuk unit ini |
| barcode | String | Barcode khusus unit ini (kotak dan strip umumnya berbeda) |
| is_base_unit | Boolean | Penanda satuan dasar |

### 3.1.3 Tabel product_batches (multi-batch & kedaluwarsa)

Menyimpan setiap batch/lot kedatangan stok beserta tanggal kedaluwarsa dan harga modal masing-masing — menjadi dasar perhitungan FEFO dan stok aktual.

| **Field** | **Tipe** | **Keterangan** |
| --- | --- | --- |
| id | UUID | Primary key |
| product_id | UUID (FK) | Relasi ke produk |
| batch_number | String | Nomor lot/batch dari supplier |
| expired_date | Date | Tanggal kedaluwarsa |
| quantity | Integer | Sisa stok batch ini, dalam base unit |
| cost_price | Decimal | Harga modal khusus batch ini (dapat berbeda antar pengiriman) |
| received_date | Date | Tanggal stok masuk |

## 3.2 Entitas Lokasi Penyimpanan (Storage Location)

Struktur lokasi rak dibuat hierarkis (Zona → Rak → Level) untuk memudahkan pencarian fisik produk. Setiap produk memiliki satu lokasi utama.

| **Field** | **Tipe** | **Keterangan** |
| --- | --- | --- |
| id | UUID | Primary key |
| zone_code | String | Contoh: "OTC", "Resep", "Alkes" |
| rack_code | String | Contoh: "A3" |
| level_code | String | Contoh: "2" |
| full_code | String | Gabungan, contoh: "OTC-A3-2" |

## 3.3 Entitas Kategori, Subkategori & Supplier

### 3.3.1 Tabel categories

| **Field** | **Tipe** | **Keterangan** |
| --- | --- | --- |
| id | UUID | Primary key |
| name | String | Nama kategori, misal: "Obat", "Vitamin & Suplemen" |
| description | Text | Deskripsi kategori (opsional) |
| display_order | Integer | Urutan tampil di UI |
| is_active | Boolean | Status aktif |

### 3.3.2 Tabel subcategories

| **Field** | **Tipe** | **Keterangan** |
| --- | --- | --- |
| id | UUID | Primary key |
| category_id | UUID (FK) | Relasi ke kategori induk |
| name | String | Nama subkategori, misal: "Analgesik", "Antibiotik" |
| display_order | Integer | Urutan tampil di UI |
| is_active | Boolean | Status aktif |

### 3.3.3 Tabel suppliers

| **Field** | **Tipe** | **Keterangan** |
| --- | --- | --- |
| id | UUID | Primary key |
| name | String | Nama supplier/distributor |
| contact_person | String | Nama PIC (Person in Charge) |
| phone | String | Nomor telepon |
| address | Text | Alamat (opsional) |
| license_number | String | Nomor izin PBF (Pedagang Besar Farmasi) |
| is_active | Boolean | Status aktif |

***Catatan: ****Field npwp dan payment_terms yang sebelumnya direncanakan disederhanakan/dihilangkan pada Pilot 1 karena belum ada kebutuhan PO formal yang memanfaatkannya — dapat ditambahkan kembali saat Purchase Order diimplementasikan pada fase berikutnya.*

## 3.4 Entitas Transaksi

| **Tabel** | **Keterangan** |
| --- | --- |
| transactions | Header transaksi penjualan: nomor invoice, kasir, total, status, metode pembayaran, waktu, waktu konfirmasi pembayaran (untuk QRIS) |
| transaction_items | Detail item per transaksi: produk, unit terpilih, jumlah, batch sumber (FEFO), subtotal |
| transaction_prescriptions | Data resep terkait transaksi: nomor resep, nama dokter, nama pasien, foto resep (jika ada item wajib resep) |
| returns | Retur transaksi: item dikembalikan, batch tujuan pengembalian stok, alasan retur, dicatat oleh |

***Catatan: ****Tabel payments yang sebelumnya berisi referensi transaksi payment gateway disederhanakan: status dan metode pembayaran kini disimpan langsung sebagai kolom pada tabel transactions, karena tidak ada lagi referensi eksternal (gateway) yang perlu disimpan terpisah pada Pilot 1.*

## 3.5 Entitas Operasional

| **Tabel** | **Keterangan** |
| --- | --- |
| employees | Data karyawan: identitas, jabatan, tanggal bergabung |
| shifts | Jadwal & catatan shift kerja karyawan |
| attendances | Absensi: check-in/out, terkait ke shift |
| cash_drawer_sessions | Sesi buka/tutup kas per shift kasir, termasuk rekonsiliasi selisih |
| stock_opname_sessions | Sesi stock opname: tanggal, daftar selisih stok fisik vs sistem, dan hasil adjustment |

***Catatan: ****Peran pengguna (Owner/Admin dan Kasir) dikelola melalui Supabase Auth (metadata pengguna), bukan melalui tabel roles **&** permissions terpisah seperti pada desain RBAC granular sebelumnya — sesuai keputusan untuk menyederhanakan menjadi dua peran tetap (lihat Bagian 7.3).*

# 4. Fitur 1: Kasir (Point of Sale)

## 4.1 Tujuan

Menyediakan antarmuka kasir yang cepat dan akurat untuk memproses transaksi penjualan, termasuk validasi khusus farmasi (klasifikasi resep, FEFO) dengan mekanisme pembayaran yang sederhana dan tidak bergantung pada integrasi pihak ketiga.

## 4.2 Daftar Kebutuhan Fungsional

### 4.2.1 Pemindaian Barcode

- Kasir dapat memindai barcode produk menggunakan scanner USB/Bluetooth (terbaca sebagai input keyboard).

- Sistem mencocokkan barcode terhadap tabel product_units — karena satu produk dapat memiliki barcode berbeda untuk tiap satuan (kotak vs strip).

- Jika barcode tidak ditemukan, sistem menampilkan opsi pencarian manual berdasarkan nama/SKU.

### 4.2.2 Pemilihan Satuan Jual

- Saat produk ditambahkan ke keranjang, kasir dapat memilih satuan jual (Kotak/Strip/Tablet) jika produk memiliki lebih dari satu satuan.

- Harga otomatis menyesuaikan berdasarkan satuan yang dipilih, sesuai data pada product_units.

- Sistem mengonversi jumlah yang dijual ke dalam base unit untuk keperluan pengurangan stok.

### 4.2.3 Validasi Klasifikasi Resep

- Jika item dalam keranjang memiliki drug_classification = prescription_required, sistem akan menahan proses checkout dan menampilkan form data resep wajib (nomor resep, nama dokter, nama pasien).

- Form mendukung unggah foto resep (disimpan ke Supabase Storage) sebagai lampiran opsional.

- Item dengan klasifikasi otc atau otc_limited dapat langsung diproses tanpa friksi tambahan.

### 4.2.4 Pengambilan Stok Otomatis (FEFO)

- Saat checkout, sistem secara otomatis memilih batch dengan expired_date paling dekat terlebih dahulu (FEFO) untuk memenuhi jumlah yang terjual.

- Jika stok pada satu batch tidak mencukupi, sistem akan memecah pengambilan dari lebih dari satu batch secara otomatis.

- Sistem mencatat batch sumber pada setiap transaction_items, untuk keperluan kartu stok dan retur.

- Produk dengan status kedaluwarsa (expired_date telah lewat) tidak dapat dijual; sistem akan memblokir dan menampilkan peringatan kepada kasir.

### 4.2.5 Metode Pembayaran

| **Metode** | **Mekanisme** |
| --- | --- |
| Cash | Input nominal diterima, sistem menghitung kembalian otomatis |
| QRIS (Statis) | Sistem menampilkan popup berisi gambar QRIS statis yang telah diunggah sebelumnya oleh Owner/Admin. Kasir menunggu pelanggan memindai dan membayar, kemudian menekan tombol "Konfirmasi Pembayaran Diterima" secara manual setelah memverifikasi pembayaran masuk (misalnya melalui notifikasi di aplikasi/perangkat penyedia QRIS milik apotek) |

- Transfer bank dan e-wallet otomatis tidak disertakan pada Pilot 1 — lihat Bagian 1.4 dan Bagian 9 untuk rencana penambahan metode pembayaran lain pada pilot berikutnya.

- Transaksi QRIS mencatat waktu konfirmasi (payment_confirmed_at) dan kasir yang mengonfirmasi, sebagai jejak audit dasar mengingat konfirmasi dilakukan manual.

### 4.2.6 Cetak Struk

- Struk dicetak otomatis melalui thermal printer setelah transaksi berhasil, mencantumkan rincian item, satuan, harga, pajak, dan metode pembayaran.

- Tersedia opsi cetak ulang struk dari riwayat transaksi.

### 4.2.7 Void & Cancel Transaksi (Sederhana)

- Kasir dapat membatalkan transaksi yang sudah tersimpan, dengan mengisi alasan pembatalan.

- Pembatalan transaksi otomatis mengembalikan stok ke batch asal.

- Setiap aksi void tercatat dengan jelas: kasir yang melakukan, waktu, dan alasan — namun tanpa mekanisme persetujuan berjenjang (approval) seperti pada desain sebelumnya. Owner/Admin dapat meninjau seluruh riwayat void kapan saja melalui laporan, namun tinjauan ini bersifat pengawasan pasca-transaksi, bukan prasyarat sebelum void dapat dilakukan.

***Catatan: ****Penyederhanaan ini sesuai dengan asumsi skala Pilot 1: satu outlet dengan jumlah kasir terbatas, di mana Owner/Admin kemungkinan adalah pihak yang juga mengawasi operasional harian secara langsung. Mekanisme approval berjenjang dapat dipertimbangkan kembali pada pilot/fase berikutnya jika skala usaha bertambah (lebih banyak kasir, kepemilikan tidak langsung mengawasi harian).*

### 4.2.8 Cash Drawer (Manajemen Kas Shift)

- Kasir membuka sesi kas di awal shift dengan mencatat modal awal (kas fisik).

- Di akhir shift, kasir menutup sesi dengan menghitung kas fisik akhir; sistem membandingkan dengan kas yang seharusnya (modal awal + penjualan cash) dan mencatat selisih jika ada.

- Riwayat sesi kas dapat ditinjau oleh Owner/Admin.

## 4.3 Alur Utama (Happy Path)

- Kasir login menggunakan Supabase Auth dan membuka sesi kas (cash drawer) di awal shift.

- Kasir memindai barcode produk atau mencari manual.

- Sistem menampilkan produk dan satuan yang tersedia; kasir memilih satuan jual.

- Jika produk wajib resep, sistem meminta data resep sebelum item dapat ditambahkan ke keranjang.

- Kasir mengulangi langkah 2-4 untuk seluruh item pembelian.

- Kasir memilih metode pembayaran (Cash atau QRIS).

- Untuk QRIS, sistem menampilkan popup gambar QRIS statis; kasir menekan tombol konfirmasi setelah memverifikasi pembayaran diterima.

- Sistem mengurangi stok berdasarkan FEFO, mencatat transaksi, dan mencetak struk.

- Kasir menutup sesi kas di akhir shift dengan rekonsiliasi.

## 4.4 Business Rules Utama

- Transaksi tidak dapat diselesaikan jika ada item wajib resep tanpa data resep terisi.

- Transaksi tidak dapat diselesaikan jika stok yang tersedia (gabungan seluruh batch aktif) tidak mencukupi jumlah yang diminta.

- Transaksi dengan metode QRIS tidak dapat diselesaikan tanpa konfirmasi manual dari kasir.

- Produk dengan seluruh batch berstatus kedaluwarsa otomatis tidak dapat dijual.

# 5. Fitur 2: Manajemen Produk & Stok

## 5.1 Tujuan

Menyediakan kontrol atas data produk, kategori, supplier, dan stok — termasuk kompleksitas khusus farmasi seperti multi-unit, multi-batch, lokasi penyimpanan, dan kepatuhan terhadap praktik FEFO — dengan proses yang ringkas dan tidak memerlukan persetujuan berjenjang.

## 5.2 Dashboard Transaksi

- Menampilkan ringkasan total transaksi dan nilai penjualan dengan filter: Hari Ini, Bulan Ini, Tahun Ini, dan Sepanjang Waktu (all-time).

- Menampilkan indikator stok kritis (produk di bawah minimum_stock) dan produk mendekati kedaluwarsa.

## 5.3 Category Management

- CRUD kategori (tingkat 1) dan subkategori (tingkat 2) — struktur hierarkis dua tingkat.

- Setiap produk wajib terhubung ke satu kategori dan satu subkategori.

## 5.4 CRUD Produk

- Form input/edit produk mencakup seluruh field dasar (lihat Bagian 3.1.1), termasuk klasifikasi obat, satuan dasar, dan lokasi rak.

- Pengelolaan multi-unit (product_units) dilakukan dalam satu form yang sama — admin dapat menambahkan satuan baru beserta harga dan barcode masing-masing.

- Validasi: setidaknya satu satuan harus ditandai sebagai is_base_unit.

- Pencarian dan filter produk berdasarkan kategori, klasifikasi obat, status stok, dan lokasi rak.

## 5.5 CRUD Supplier

- Form input/edit supplier mencakup field pada Bagian 3.3.3, termasuk nomor izin PBF (Pedagang Besar Farmasi).

## 5.6 Lokasi Penyimpanan (Storage Location)

- Pengelolaan struktur hierarkis Zona → Rak → Level sebagai master data tersendiri.

- Setiap produk ditautkan ke satu lokasi penyimpanan utama, digunakan untuk pencarian cepat produk oleh staf.

## 5.7 Manajemen Stok & Batch

### 5.7.1 Input Stok & Batch (Manual)

- Penambahan stok dilakukan melalui input manual: admin/staf menginput produk, jumlah, nomor batch, tanggal kedaluwarsa, harga modal, dan tanggal terima.

- Setiap input stok manual membuat entri baru pada product_batches, kecuali nomor batch dan tanggal kedaluwarsa identik dengan entri sebelumnya.

### 5.7.2 Kartu Stok per Batch

- Kartu stok ditampilkan berdasarkan riwayat transaksi, retur, dan adjustment opname yang terkait dengan masing-masing batch.

- Laporan kartu stok dapat ditampilkan per produk maupun per batch spesifik.

### 5.7.3 Peringatan Kedaluwarsa

- Sistem menampilkan notifikasi untuk batch yang akan kedaluwarsa dalam rentang waktu yang dapat dikonfigurasi (misal: 30/60/90 hari ke depan).

- Batch yang sudah melewati tanggal kedaluwarsa otomatis disembunyikan dari proses penjualan.

## 5.8 Stock Opname (Sederhana)

- Admin dapat membuat sesi stock opname baru, dengan daftar produk yang dapat difilter berdasarkan lokasi rak.

- Staf menginput jumlah stok fisik aktual per produk (dan per batch jika dapat diidentifikasi).

- Sistem menghitung selisih antara stok sistem dan stok fisik, dan staf/admin dapat langsung menerapkan adjustment tersebut dengan mengisi catatan/alasan — tanpa memerlukan persetujuan tambahan dari pihak lain.

- Riwayat seluruh sesi opname dan adjustment tersimpan untuk ditinjau Owner/Admin kapan saja.

## 5.9 Fitur Retur (Sederhana)

- Retur dapat diajukan dari riwayat transaksi (retur dari pelanggan) atau secara independen (retur ke supplier untuk produk kedaluwarsa/cacat).

- Retur dari pelanggan mengembalikan stok ke batch asal tempat item tersebut awalnya diambil (tercatat pada transaction_items saat checkout), bukan menambahkan ke batch baru.

- Setiap retur dicatat dengan alasan dan siapa yang memprosesnya, dan langsung diterapkan ke stok — tanpa mekanisme persetujuan berjenjang.

- Retur ke supplier mencatat pengurangan stok dari batch terkait dengan alasan (kedaluwarsa, rusak, recall) dan tidak memengaruhi laporan penjualan.

# 6. Fitur 3: Laporan & Keuangan

## 6.1 Tujuan

Memberikan visibilitas keuangan dasar kepada pemilik/Owner apotek, dengan memperhitungkan kompleksitas harga modal per-batch dan harga jual per-satuan.

## 6.2 Laporan Penjualan

- Rekap penjualan dengan filter periode: harian, mingguan, bulanan, dan tahunan.

- Dapat ditampilkan dalam bentuk ringkasan (total omset, jumlah transaksi, rata-rata nilai transaksi) maupun rincian per produk/kategori.

- Filter tambahan: berdasarkan kasir dan metode pembayaran (Cash/QRIS).

## 6.3 Laporan Laba-Rugi

- Menghitung omset bersih dengan formula: Total Penjualan − Harga Pokok Penjualan (HPP) − Biaya Operasional.

- HPP dihitung berdasarkan cost_price dari batch yang benar-benar terjual (sesuai pencatatan FEFO pada saat transaksi), bukan harga modal rata-rata.

- Biaya operasional (gaji, sewa, listrik, dan lainnya) dapat diinput sebagai entri manual per periode oleh Owner/Admin.

## 6.4 Perhitungan Pajak (PPN)

- Setiap produk memiliki flag is_taxable dan tax_rate sendiri.

- Sistem menghitung PPN otomatis pada setiap transaksi, ditampilkan secara terpisah pada struk dan laporan.

## 6.5 Laporan Stok (Pendukung Keuangan)

- Laporan nilai stok saat ini (berdasarkan cost_price tiap batch yang masih tersedia).

- Laporan kartu stok per produk/batch sebagaimana dijelaskan pada Bagian 5.7.2.

# 7. Operasional

## 7.1 Tujuan

Mendukung pengelolaan akses dan operasional dasar karyawan apotek dengan struktur peran yang sederhana, sesuai skala Pilot 1.

## 7.2 Manajemen Karyawan

- CRUD data karyawan: identitas, jabatan, dan tanggal bergabung.

- Pencatatan absensi (check-in/check-out) yang terhubung dengan sesi shift dan cash drawer (Bagian 4.2.8) untuk kasir.

- Penjadwalan shift kerja per karyawan.

## 7.3 Peran Akses (Dua Peran)

Pilot 1 menggunakan dua peran tetap, dikelola melalui Supabase Auth, tanpa permission matrix granular per modul/aksi:

| **Peran** | **Hak Akses** |
| --- | --- |
| Owner/Admin | Akses penuh ke seluruh modul: kasir, manajemen produk & stok, laporan & keuangan, manajemen karyawan, dan pengaturan (termasuk unggah gambar QRIS statis) |
| Kasir | Akses ke modul kasir (transaksi, cash drawer) dan dapat melihat (namun tidak mengubah) data produk untuk kebutuhan pencarian saat transaksi |

- Seluruh aksi penting (transaksi, void, retur, adjustment stok) tetap mencatat identitas pelaku (kasir/admin yang login), terlepas dari tidak adanya mekanisme approval — sehingga riwayat tetap dapat ditelusuri oleh Owner/Admin.

***Catatan: ****Jika di kemudian hari dibutuhkan peran tambahan (misalnya Apoteker dengan kewenangan khusus atas validasi resep, atau Supervisor terpisah dari Owner), struktur dua peran ini dapat diperluas tanpa perlu mengubah fondasi Supabase Auth yang sudah digunakan — lihat Bagian 9 untuk pertimbangan pilot/fase berikutnya.*

# 8. Non-Functional Requirements

## 8.1 Performa

- Proses pemindaian barcode hingga produk tampil di keranjang harus berlangsung kurang dari 1 detik.

- Popup gambar QRIS statis harus tampil seketika (kurang dari 1 detik) karena gambar sudah tersimpan, bukan digenerate dinamis.

- Setiap panggilan API (Next.js API Route) harus menyelesaikan eksekusi dalam batas waktu serverless function di Vercel (sekitar 10 detik pada tingkatan gratis); operasi yang berpotensi lama (laporan tahunan dengan data besar) perlu dioptimalkan melalui agregasi/paginasi di sisi database.

## 8.2 Keandalan & Integritas Data

- Seluruh operasi yang memengaruhi stok (penjualan, retur, adjustment opname) harus bersifat atomik (database transaction) untuk mencegah inkonsistensi data, khususnya saat pengambilan stok dari beberapa batch sekaligus.

- Client Supabase pada setiap API Route harus diinisialisasi di dalam request handler, bukan disimpan pada variabel bersama antar request, untuk mencegah kebocoran data sesi antar pengguna pada lingkungan serverless Vercel.

## 8.3 Keamanan

- Seluruh komunikasi menggunakan HTTPS (default pada Vercel).

- Autentikasi pengguna menggunakan Supabase Auth dengan refresh token otomatis.

- Foto resep dan data pasien disimpan di Supabase Storage dengan akses terbatas sesuai peran (Owner/Admin dan Kasir).

## 8.4 Auditability

- Seluruh aksi penting (transaksi, void, retur, adjustment stok, konfirmasi pembayaran QRIS) mencatat waktu dan identitas pelaku, meskipun tidak melalui mekanisme approval berjenjang.

## 8.5 Biaya Operasional

- Seluruh komponen (Vercel, Supabase) ditargetkan beroperasi dalam tingkatan gratis (free tier) pada skala satu outlet dengan beberapa kasir, sesuai tujuan utama Pilot 1 untuk memvalidasi konsep dengan biaya minimal.

- Jika penggunaan melebihi batas tingkatan gratis (misalnya jumlah baris database di Supabase atau jumlah eksekusi function di Vercel), peningkatan ke tingkatan berbayar awal pada kedua platform tersebut relatif murah (kisaran USD 0-25/bulan) dibandingkan kompleksitas dan biaya infrastruktur pada rencana arsitektur sebelumnya.

# 9. Roadmap & Pertimbangan Pilot 2

## 9.1 Filosofi Perencanaan

Berbeda dari pendekatan dokumen sebelumnya yang menyiapkan skema data sejak awal untuk fitur yang ditunda, Pilot 1 secara sengaja menjaga skema data seminimal mungkin. Pertimbangannya: pada tahap validasi awal, bentuk akhir kebutuhan (misalnya skema Purchase Order, atau struktur multi-cabang) belum tentu sesuai dengan asumsi yang dibuat hari ini. Mendesain skema terlalu awal untuk kebutuhan yang belum pasti berisiko menghasilkan struktur yang harus diubah ulang, alih-alih dipakai langsung.

## 9.2 Urutan Pengembangan Pilot 1

| **Tahap** | **Fokus** |
| --- | --- |
| Tahap 1 | Setup Next.js + Supabase + Vercel, struktur database inti (produk, unit, batch, kategori, supplier, lokasi rak) |
| Tahap 2 | Kasir inti: barcode, pemilihan unit, FEFO, validasi resep, cash payment, cetak struk |
| Tahap 3 | QRIS statis: unggah gambar QRIS, popup pembayaran, konfirmasi manual |
| Tahap 4 | Manajemen stok lanjutan: stock opname, retur, alert kedaluwarsa |
| Tahap 5 | Laporan & keuangan: dashboard, laporan penjualan, laba-rugi, pajak |
| Tahap 6 | Operasional: manajemen karyawan, shift, cash drawer, dua peran akses |

## 9.3 Pertimbangan Migrasi ke Pilot 2

Beberapa keputusan pada Pilot 1 perlu ditinjau ulang secara spesifik saat memasuki Pilot 2, dengan trade-off yang sudah diidentifikasi sejak tahap ini:

### 9.3.1 Integrasi Payment Gateway

- Arsitektur Next.js + Vercel + Supabase yang dipilih pada Pilot 1 tetap dapat digunakan untuk Pilot 2 dengan payment gateway — tidak diperlukan migrasi ke server yang harus selalu hidup (seperti Railway/Render/VPS) hanya karena alasan menerima webhook, karena Next.js API Route sudah dapat menjadi endpoint publik yang menerima notifikasi pembayaran.

- Hal yang perlu diperhatikan saat implementasi: (1) idempotency pada endpoint webhook, agar notifikasi yang dikirim lebih dari satu kali oleh payment gateway tidak menyebabkan duplikasi pencatatan transaksi atau pengurangan stok dua kali; (2) memastikan koneksi ke database Supabase menggunakan mode connection pooling (Supavisor/PgBouncer, sudah disediakan Supabase secara bawaan), karena serverless function dapat menjalankan banyak instance bersamaan yang masing-masing membuka koneksi baru; (3) desain pemeriksaan status transaksi yang atomic, untuk menghindari konflik antara proses polling status dari sisi kasir dan notifikasi webhook yang datang hampir bersamaan.

- Tabel transactions perlu diperluas dengan kolom referensi eksternal (misalnya payment_gateway_reference_id) saat fitur ini diimplementasikan; perubahan ini bersifat aditif dan tidak memerlukan migrasi struktural besar dari skema Pilot 1.

### 9.3.2 Approval Workflow

- Jika skala usaha bertambah (lebih banyak kasir, kepemilikan yang tidak mengawasi operasional harian secara langsung), mekanisme approval berjenjang untuk void/retur/opname sebagaimana dirancang pada dokumen sebelumnya dapat dipertimbangkan kembali dan diimplementasikan sebagai penambahan terhadap struktur yang ada, tanpa mengubah fondasi pencatatan yang sudah berjalan di Pilot 1.

### 9.3.3 Purchase Order & Goods Receipt

- Skema untuk PO/GR akan didesain saat fitur ini benar-benar dikerjakan, dengan mempertimbangkan pola input stok manual yang telah berjalan di Pilot 1 sebagai referensi kebutuhan riil di lapangan.

### 9.3.4 Multi-Cabang dan Kanal Online

- Karena Pilot 1 tidak menyertakan kolom outlet_id sejak awal, migrasi ke multi-cabang pada fase berikutnya memerlukan penambahan kolom tersebut ke seluruh tabel transaksional dan operasional, beserta migrasi data dari kondisi single-outlet. Ini adalah trade-off yang disadari dan diterima demi kesederhanaan skema pada Pilot 1.

### 9.3.5 RBAC Granular, Payroll, dan CRM

- Modul-modul ini dapat ditambahkan secara independen pada fase berikutnya tanpa memengaruhi fondasi yang sudah dibangun pada Pilot 1, karena keduanya tidak memiliki dependensi struktural terhadap modul kasir maupun stok.

# 10. Open Questions & Asumsi

## 10.1 Hal yang Masih Memerlukan Keputusan

- Mekanisme rekonsiliasi antara catatan transaksi QRIS di sistem dengan mutasi rekening/aplikasi merchant QRIS yang sebenarnya — apakah dilakukan manual oleh Owner/Admin secara berkala, atau perlu fitur pendukung tambahan.

- Penanganan jika kasir keliru menekan "Konfirmasi Pembayaran Diterima" padahal pembayaran belum diterima — apakah cukup dengan void transaksi manual, atau perlu mekanisme koreksi khusus.

- Kebijakan retur khusus untuk obat wajib resep (regulasi/kebijakan internal apotek terkait pengembalian obat resep).

## 10.2 Asumsi yang Digunakan dalam Dokumen Ini

- Pilot 1 beroperasi pada satu lokasi fisik dengan satu atau beberapa kasir, di mana Owner/Admin dapat mengawasi operasional secara langsung sehingga mekanisme approval berjenjang belum diperlukan.

- Perangkat kasir memiliki koneksi internet stabil sepanjang operasional, karena arsitektur serverless yang dipilih tidak mendukung mode offline.

- Apotek memiliki rekening/akun merchant QRIS aktif secara independen dari sistem ini; sistem hanya menampilkan gambar QRIS statis yang diunggah, tidak terintegrasi dengan penyedia QRIS manapun.

- Printer thermal yang digunakan kompatibel dengan standar ESC/POS.

- Pengelolaan resep pada Pilot 1 bersifat pencatatan administratif (nomor resep, dokter, pasien), bukan verifikasi medis otomatis.

Halaman