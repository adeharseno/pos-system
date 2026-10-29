# Fase 1 — Master Produk

## Audit

- Create lama: `POST /api/products` memerlukan harga modal, harga jual dan pajak. RPC membuat produk dan unit dasar secara atomik. Kontrak lama tetap tersedia untuk impor dan pemanggil existing.
- Stok awal: RPC terpisah membuat batch dengan biaya dari produk; mutasi stok diblokir saat opname berlangsung. Master baru tidak memanggil RPC ini atau alur penerimaan lama.
- Edit produk memperbarui metadata; harga jual disimpan di `product_units` dan diubah melalui API/form edit satuan existing. Halaman Edit Produk kini menyediakan tautan harga jual yang jelas.
- Pemasok utama opsional, menggunakan dropdown pemasok aktif existing. FK tetap memvalidasi pemasok. FK komposit memvalidasi pasangan kategori/subkategori, dan unique SKU tetap berlaku.
- Minimum stok tersimpan pada produk, bukan kuantitas stok. Kuantitas tersedia dihitung dari batch yang belum kedaluwarsa.
- Permission tetap `owner_admin` untuk create/edit. Pengaturan dan pencarian Daftar Barang existing dipertahankan, termasuk perubahan supplier yang sudah ada di working tree sebelum tugas ini.

## Perubahan dan kontrak

- Form menggunakan komponen TailAdmin existing, ukuran kontrol existing, Bahasa Indonesia, grid responsif, serta hanya dua tombol aksi di bawah.
- `Tambah Master Produk` menuju `/products/new`. `Terima Barang` nonaktif dengan keterangan fase invoice berikutnya; tanpa tautan ke penerimaan lama atau halaman sementara.
- Endpoint baru `POST /api/products/master` memvalidasi hanya data master; menolak payload harga, batch, stok, barcode, dan override aktivasi. Minimum stok default 5, integer nonnegatif dalam rentang PostgreSQL integer.
- Insert produk dilakukan satu operasi atomik pada backend existing. Tidak membuat unit jual atau batch. Tanpa unit jual, kasir tidak mempunyai unit yang dapat ditambahkan ke keranjang, termasuk jika suatu saat stok sudah tersedia.
- Konflik backend telah dijelaskan sebelum perubahan: `products.cost_price` sebelumnya NOT NULL, default 0. Migration `0023_product_master_optional_cost.sql` hanya mengizinkan NULL agar harga modal yang belum diketahui tidak dipalsukan menjadi nol. Data lama, default lama, check nonnegatif dan kontrak RPC berharga dipertahankan. Master secara eksplisit menyimpan NULL.
- Detail dan edit menangani harga modal kosong; edit metadata tidak mengubahnya otomatis menjadi nol. Tampilan harga modal di penerimaan lama hanya disesuaikan untuk NULL, tanpa mengubah alur penerimaan.
- Unit dasar dengan konversi 1 yang ditambahkan melalui alur satuan existing dikenali sebagai unit dasar; harga wajib diisi melalui form existing sebelum unit tersebut dibuat. Harga jual existing tetap dapat diedit.

## Validasi

- `npm run typecheck`, `npm run lint`, `npm run build`: lulus.
- Tes catalog dan permission: 40 lulus; tambahan tes markup form master: 1 lulus; cashier: 18 lulus; auth: 9 lulus.
- Database lokal: master-only (8), create master lama (10), supplier (5), initial stock (12), receiving (12): lulus, total 47 assertion.
- Dua suite stok awalnya gagal karena sesi opname aktif yang sudah ada di database lokal. Pengulangan menggunakan salinan SQL in-memory dengan isolasi sesi tersebut di dalam transaksi, diakhiri ROLLBACK; seluruh assertion lulus dan sesi awal tetap utuh. File tes stok existing tidak diubah.
- Migration hanya diterapkan dengan `supabase migration up --local`. Tidak mengakses database Production, membuat branch, push, atau deploy.

Fase 1 berhenti di sini. Invoice dan Penerimaan Barang fase berikutnya belum diimplementasikan. Pemeriksaan visual browser interaktif belum dilakukan; struktur form diperiksa melalui tes render markup.
