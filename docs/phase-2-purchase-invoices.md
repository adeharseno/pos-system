# Fase 2 — Invoice Pembelian Draft

## Audit dan migration

Schema sebelumnya hanya memiliki nomor invoice untuk transaksi penjualan, bukan invoice pembelian atau ledger pembayaran supplier. Supplier CRUD, role guard, komponen TailAdmin, dan pola API/server Supabase existing digunakan kembali.

Migration `0024_purchase_invoice_drafts.sql` menambahkan:

- `purchase_invoices`: informasi invoice, status hanya Draft, metadata dokumen, versi edit, dan actor server.
- `purchase_invoice_payments`: ledger dengan kunci unik per invoice/pembayaran. Pembayaran awal menggunakan satu kunci `initial`; edit Draft mengoreksi baris tersebut, bukan menambahkan pembayaran baru. Nilai nol tidak membuat baris pembayaran.
- `purchase_invoice_requests`: kunci retry beserta payload dan actor. Permintaan identik aman diulang; pemakaian ulang kunci dengan payload berbeda ditolak. Riwayat koreksi Draft tetap tercatat di sini, termasuk koreksi pembayaran menjadi nol.
- RPC `save_purchase_invoice_draft`: invoice, koreksi pembayaran awal, dan kunci retry ditulis dalam satu transaksi. Lock per invoice dan versi edit mencegah penimpaan dari dua tab. Ledger menyediakan kunci terpisah bagi pembayaran lanjutan, tetapi API pembayaran lanjutan belum dibuat.
- Unique index pemasok + nomor invoice tanpa membedakan huruf besar/kecil dan spasi tepi; validasi uang, tanggal, FK, role actor aktif, serta RLS dan pembatasan hak akses langsung.
- Bucket private `purchase-invoices`, maksimal 10 MB, JPEG/PNG/WebP/PDF. Browser tidak mendapat policy akses bucket. Tabel hanya dapat dibaca service role, sedangkan penulisan dilakukan melalui RPC khusus.

Migration hanya diterapkan ke Supabase lokal. Type database ditambah khusus tabel/RPC baru; kontrak lain dipertahankan, termasuk penanganan nullable cost dari Fase 1. Tidak ada perubahan pada RPC stok, checkout, createProduct, atau form Master Produk.

## API

- `GET /api/purchase-invoices`: hingga 100 invoice terbaru.
- `POST /api/purchase-invoices`: create Draft, multipart form.
- `GET /api/purchase-invoices/[id]`: detail termasuk pembayaran tersimpan.
- `PATCH /api/purchase-invoices/[id]`: edit Draft dengan versi yang diharapkan dan kunci retry baru.
- `GET /api/purchase-invoices/[id]/document`: unduhan terotorisasi, `private, no-store`, attachment, dan `nosniff`; path berasal dari invoice tersimpan, bukan input URL pengguna.

Semua endpoint memerlukan `owner_admin` aktif, mengikuti authorization supplier existing. POST/PATCH juga memeriksa Origin. Actor tidak diambil dari form. Pembayaran dibatasi 0 sampai total positif, dengan maksimal dua angka desimal. Status pembayaran dihitung dari jumlah pembayaran, tidak diterima dari input pengguna.

Upload memeriksa ukuran, MIME, ekstensi, dan signature isi. Nama object dibuat server dari ID invoice, ID request, serta SHA-256 isi; tidak menimpa object existing. Pengulangan upload dengan isi sama aman. Penggantian dokumen dan pengubahan invoice tersimpan atomik di database setelah upload tersedia. Batas proxy Next dinaikkan menjadi 11 MB untuk menampung file 10 MB dan metadata multipart.

## UI

- Tombol **Terima Barang** dari Daftar Barang menuju `/purchase-invoices/new`; tersedia juga akses daftar invoice.
- Form **Penerimaan Barang Baru** hanya berisi enam field invoice yang diminta. Pemasok menggunakan combobox pencarian server melalui API supplier existing, dengan navigasi keyboard. Tambah pemasok membuka pengelolaan supplier existing di tab baru agar form invoice tidak hilang.
- Pembayaran default 0; status Belum Dibayar / Belum Lunas / Lunas dihitung otomatis. Tombol **Simpan Invoice** hanya di bawah.
- Setelah berhasil, halaman detail menampilkan konfirmasi tersimpan, status Draft/pembayaran, informasi invoice, unduhan, dan **Edit Invoice Draft**.
- Jika hasil request tidak pasti, form mempertahankan payload dan kunci retry yang sama; perubahan isian dikunci sampai retry atau pengguna memeriksa daftar invoice.
- Menggunakan komponen TailAdmin existing, teks Bahasa Indonesia, kontrol besar, dan grid satu kolom pada mobile. Tidak ada input/list produk, tombol lanjut isi barang, atau halaman sementara Fase 3.

## Hasil validasi

- `npm run typecheck`: lulus.
- `npm run lint`: lulus.
- `npm run build`: lulus.
- Tes aplikasi gabungan purchasing, catalog, auth, permission, dan cashier: **73 lulus**. `npm run test:purchasing`: **5 lulus**.
- `supabase test db --local` untuk invoice, master-only, dan supplier: **30 assertion lulus**, termasuk **17 assertion invoice**.
- `npm run test:purchasing:api` dengan server lokal port 3102: lulus. Menguji create/edit, duplicate per supplier, nomor sama pada supplier berbeda, pembayaran nol/sebagian/lunas/kembali nol, retry identik, konflik request, konflik versi, request serentak, PDF/foto/penggantian/preservasi dokumen, file palsu, file terlalu besar, file tepat 10 MB, unduh private, 401/403, penolakan Origin asing, serta render empat halaman invoice.
- Tes API membandingkan snapshot seluruh row produk, unit jual, dan batch sebelum/sesudah: **tidak berubah**. Fixture invoice, pembayaran, request, supplier, actor auth, dan file tes dibersihkan di akhir. Script menolak URL non-local.
- `git diff --check`: lulus.

## Keterbatasan dan batas fase

- Daftar menampilkan 100 invoice terbaru; pagination/pencarian invoice belum dibuat.
- Object dokumen lama atau upload yang tidak terhubung akibat penyimpanan gagal tetap private dan belum dibersihkan otomatis. Object tidak langsung dihapus ketika hasil RPC tidak pasti, karena transaksi mungkin telah berhasil; retensi/pembersihan terjadwal belum diimplementasikan.
- Validasi file mencakup format/signature/ukuran, bukan pemindaian malware atau OCR. Verifikasi UI dilakukan lewat render markup dan HTTP halaman; belum ada pemeriksaan browser interaktif pada perangkat mobile.
- Belum ada pengisian produk, penerimaan stok, finalisasi invoice, maupun antarmuka pembayaran lanjutan. Fase 3 tidak dikerjakan.

Branch tetap sama. Tidak push, deploy, atau mengakses database Production.
