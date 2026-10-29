# M7.1 Full System QA Audit

Tanggal audit: 30 Oktober 2026  
Lingkup: Pharmacy POS Fase 1–6 pada branch/worktree saat ini  
Mode: audit-only; tidak ada perubahan kode aplikasi, schema, RPC, maupun data lokal utama

## Ringkasan eksekutif

- **P0:** 0 temuan.
- **P1:** 3 temuan terkonfirmasi: permission individu belum menjadi guard lintas modul, aturan batas minimum stok berbeda antarhalaman, dan test HTTP/E2E tidak dapat berjalan pada runtime Node 20 project saat ini.
- **P2:** 4 temuan terkonfirmasi: suite database tidak terisolasi dari data developer, query cash drawer yang hasilnya tidak digunakan, cleanup test concurrency karyawan dapat gagal/hang, dan halaman persediaan memuat seluruh katalog/batch pada SSR.
- **P3:** 1 kelompok warning lint database.
- Typecheck, lint, build Webpack, 222 test TypeScript, 373 test pgTAP terisolasi, finalisasi penerimaan, serta tiga suite concurrency inti lulus.
- Browser interaktif tidak tersedia di environment audit. Tidak ada klaim bahwa pengujian browser, responsivitas visual, atau alur pengguna end-to-end berhasil.

## Metode, batasan, dan keamanan data

Audit dilakukan dengan inspeksi statis lintas modul, automated test existing, build produksi, pgTAP, concurrency test, serta percobaan test HTTP lokal. Database utama lokal **tidak di-reset dan tidak dibersihkan**. Karena terdapat stock opname aktif milik developer, database dikloning ke database sementara; hanya pada clone tersebut fixture stock opname aktif dihapus. Clone dan dump sementara kemudian dihapus setelah audit.

Tidak ada akses Supabase Production, branch baru, push, deploy, schema/RPC change, atau perubahan data existing. Pemeriksaan browser tidak dilakukan karena executable Chromium/Chrome/Playwright dan browser harness tidak tersedia. Percobaan HTTP dashboard dan API berhenti sebelum request pertama akibat incompatibility WebSocket pada Node 20 (F-03).

## Hasil pengujian

| Pemeriksaan | Hasil | Bukti/catatan |
|---|---:|---|
| `npm run typecheck` | Lulus | 0 error |
| `npm run lint` | Lulus | 0 error/warning ESLint |
| `npx next build --webpack` | Lulus | Build produksi dan 46 route/page selesai |
| `npx tsx --test src/modules/**/*.test.ts src/modules/**/*.test.tsx` | Lulus | 222 test, 0 gagal |
| `npx supabase db lint --local` | Selesai dengan warning | Lihat F-08 |
| `npm run db:test` pada DB utama lokal | Gagal karena state existing | Stock opname `in_progress` mengganggu 4 file test; data tidak diubah, lihat F-04 |
| Full pgTAP pada clone terisolasi | Lulus | 23 file, 373 test, 0 gagal |
| `core-rpc-concurrency.cjs` pada clone | Lulus | 23 grup skenario, 230 run, 530 check; 0 deadlock/lock timeout |
| `permission-guard.cjs` pada clone | Lulus | Guard permission/concurrency |
| `purchase-invoice-payments.cjs` pada clone | Lulus | Partial/full/duplicate/concurrency dan stok/harga tetap |
| `purchase-receiving-finalization.cjs` | Lulus | Batch, weighted cost, opname, retry, concurrency, rollback, expiry, harga jual tetap |
| `employee-admin.cjs` pada clone | Skenario inti lulus; cleanup gagal | Duplicate create, invitation, email reservation, actor revalidation lulus; lihat F-06 |
| Test HTTP employee/dashboard | Terblokir | Node 20 tidak memiliki native WebSocket; lihat F-03 |
| Browser desktop/mobile | Tidak tersedia | Tidak dijalankan dan tidak diklaim lulus |

## Temuan terkonfirmasi

### F-01 — P1 — Pengaturan permission individu tidak melindungi mayoritas fitur

**Dampak:** UI “Kelola Akses” dapat menyimpan allow/deny untuk kemampuan operasional, tetapi mayoritas page dan API produk, persediaan, laporan, pembelian, dan transaksi masih memeriksa role saja. Sebagai contoh, deny `products.view` untuk kasir tidak mencegah akses ke route yang memakai `requirePosOperator`; allow ke staf juga tidak membuka route yang masih role-guarded. Ini menciptakan ekspektasi keamanan yang tidak sesuai dengan enforcement backend.

**Bukti/lokasi:**

- `src/modules/auth/application/auth-service.ts:19-26` mempertahankan `requireRole`/`requirePosOperator` terpisah dari `requirePermission`.
- `docs/permissions.md:3-5` dan `docs/permissions.md:47-49` menyatakan route existing belum dimigrasikan dan role SQL masih authoritative.
- Pencarian source menemukan penggunaan `requirePermission` di workflow administrasi karyawan, tetapi route lintas modul masih dominan memakai `requireRole`/`requirePosOperator`, misalnya `src/app/api/products/route.ts`, `src/app/api/purchase-invoices/route.ts`, dan `src/modules/reports/product-performance-service.ts`.
- `src/modules/auth/components/employee-access.tsx:39-70` menyediakan UI perubahan akses individu.
- `src/modules/ui/app-shell.tsx:11-16,51-58` menyaring menu hanya berdasarkan flag `admin` dan role, bukan effective permissions.

**Reproduksi:** login sebagai Owner → Karyawan → Kelola Akses kasir → deny “Melihat Produk” → login sebagai kasir → buka `/products`; akses tetap mengikuti role guard, bukan override. Pengujian HTTP langkah ini belum dapat dijalankan karena F-03, tetapi alur kode dan contract test permission mengonfirmasi perilakunya.

**Rekomendasi:** inventaris seluruh page/API/service lalu migrasikan guard per capability dari backend terlebih dahulu; gunakan effective permission yang sama untuk navigasi. Jangan mengandalkan hidden UI. Tambahkan matriks integration test role × override × route sebelum mengaktifkan opsi permission di UI.

### F-02 — P1 — Produk tepat pada minimum stok memiliki status berbeda antarhalaman

**Dampak:** produk aktif dengan stok tersedia `5` dan minimum `5` tampil **Normal/Tersedia** di Daftar Barang dan Dashboard, tetapi **Stok Menipis** di Persediaan/detail. Staf dapat menerima instruksi pengadaan yang bertentangan.

**Bukti/lokasi:**

- `src/modules/catalog/product-stock-status.ts:3-6`: low hanya bila `availableStock < minimumStock`.
- `src/modules/inventory/inventory-rules.ts:9-10`: low bila `availableStock <= minimumStock`.
- Pemakai aturan pertama: `src/modules/catalog/components/product-presentation.tsx:16` dan `src/modules/dashboard/dashboard-model.ts:54`.
- Pemakai aturan kedua: `src/modules/inventory/data/inventory-overview-queries.ts:37-42` dan detail inventory melalui `summarizeInventoryBatches`.

**Reproduksi:** buat/identifikasi produk aktif dengan minimum 5 dan total batch non-expired 5 → bandingkan `/products`, Dashboard “Barang Perlu Diisi Ulang”, dan `/inventory`.

**Rekomendasi:** tetapkan satu helper/domain rule bersama sesuai kontrak Fase 4/6 (`< minimum` = menipis, `>= minimum` = normal), lalu tambahkan contract test yang dipakai semua presenter/query.

### F-03 — P1 — Test HTTP/E2E lokal tidak kompatibel dengan runtime Node 20

**Dampak:** test API karyawan, invoice pembelian, import, dan dashboard berhenti sebelum request pertama. Akibatnya autentikasi cookie/session, redirect, CSRF/origin, serta integrasi UI↔API belum tervalidasi end-to-end pada environment project ini.

**Bukti/lokasi:**

- `package.json` menggunakan `@supabase/supabase-js` 2.108.0 dan tidak menyediakan transport `ws`.
- `supabase/tests/employee-api.cjs:7,14` membuat Supabase client yang menginisialisasi Realtime; pola yang sama terdapat pada test HTTP lain.
- `npm run test:employees:api` dan `dashboard-ui.cjs` gagal dengan: `Node.js 20 detected without native WebSocket support` dan menyarankan Node >=22 atau transport `ws`.

**Reproduksi:** pada Node 20.19.4 jalankan `npm run test:employees:api` atau `node --env-file=.env.local supabase/tests/dashboard-ui.cjs`.

**Rekomendasi:** pin runtime CI/dev ke Node >=22 atau sediakan transport WebSocket eksplisit khusus test. Setelah itu jadikan suite HTTP wajib dan jalankan terhadap server build lokal serta database fixture terisolasi.

### F-04 — P2 — Full pgTAP bergantung pada kebersihan database developer

**Dampak:** `npm run db:test` tidak repeatable pada database lokal yang sah memiliki stock opname aktif. Empat kelompok test gagal dengan `STOCK_OPNAME_IN_PROGRESS`/unique active session, sehingga hasil regresi dapat keliru dan developer terdorong membersihkan data manual.

**Bukti:** database lokal memiliki satu session `in_progress` (dibuat 25 Oktober 2026). Test `constraints`, `core_functions`, `product_initial_stock`, dan `stock_receiving` gagal. Pada clone identik yang mengisolasi fixture, seluruh 373 test lulus.

**Reproduksi:** sisakan satu stock opname aktif lalu jalankan `npm run db:test`.

**Rekomendasi:** jalankan pgTAP dalam disposable database/transaction fixture yang dimiliki test, atau buat setup yang menutup hanya fixture buatan test. Jangan reset database developer sebagai bagian test.

### F-05 — P2 — Query cash drawer tambahan pada setiap protected SSR tidak digunakan

**Dampak:** setiap request halaman protected untuk owner/kasir menambah satu query/RPC cash drawer, termasuk halaman yang tidak membutuhkan status kasir. Ini menambah latency dan beban Supabase secara konsisten.

**Bukti/lokasi:** `src/app/(protected)/layout.tsx:16-17` memanggil `getCurrentCashDrawer` dan mengirim `drawerOpen`; `src/modules/ui/app-shell.tsx:19` mendeklarasikan prop tersebut tetapi tidak mendestructure atau memakainya.

**Reproduksi:** instrumentasi query pada request `/dashboard` atau `/products`; terlihat fetch drawer walaupun hasil tidak memengaruhi render.

**Rekomendasi:** hilangkan fetch dari layout bila tidak dibutuhkan, atau gunakan hanya di route/component cash drawer/cashier. Tambahkan assertion jumlah request pada SSR smoke test.

### F-06 — P2 — Cleanup test concurrency karyawan dapat gagal dan menggantung

**Dampak:** skenario concurrency inti lulus, tetapi cleanup mencoba menghapus seluruh owner fixture setelah salah satunya dinonaktifkan. Pada database terisolasi tanpa owner lain, trigger `LAST_ACTIVE_OWNER` menolak cleanup dan proses tidak menutup koneksi secara bersih.

**Bukti/lokasi:** `supabase/tests/concurrency/employee-admin.cjs:39-44` menonaktifkan salah satu owner; cleanup `:45-56` langsung menghapus semua fixture owner dalam satu transaksi. Pada clone audit output PASS muncul, lalu cleanup gagal `LAST_ACTIVE_OWNER` dan proses harus dihentikan.

**Reproduksi:** jalankan script pada database disposable tanpa owner existing.

**Rekomendasi:** buat sentinel owner fixture yang hidup sampai cleanup selesai, pulihkan status owner sebelum delete, dan pastikan koneksi ditutup pada error cleanup.

### F-07 — P2 — Overview persediaan melakukan full-table fetch dan agregasi di SSR

**Dampak:** halaman `/inventory` mengambil seluruh produk, kategori, dan seluruh batch non-expired lalu mengagregasi/filter di Node untuk setiap request. Waktu render dan penggunaan memori bertumbuh linear terhadap seluruh katalog, walaupun pengguna hanya mencari sebagian data; tidak ada server-side pagination.

**Bukti/lokasi:** `src/modules/inventory/data/inventory-overview-queries.ts:18-43` menjalankan tiga query tanpa range/limit dan melakukan grouping, search, serta status filter setelah seluruh row diterima.

**Reproduksi:** seed katalog/batch dalam jumlah besar, request `/inventory`, lalu ukur row transfer, heap, dan TTFB.

**Rekomendasi:** usulkan query read-only teragregasi dengan pagination server-side dan filter di database. Pertahankan business logic stok/expired yang sama dan ukur `EXPLAIN ANALYZE` sebelum perubahan.

### F-08 — P3 — Warning lint fungsi database

**Dampak:** tidak terbukti menghasilkan hasil salah, tetapi meningkatkan risiko type coercion dan menyulitkan maintenance.

**Bukti:** `supabase db lint --local` melaporkan assignment literal text `[]` ke variabel `jsonb` pada `purchase_receiving_plan` dan `finalize_purchase_receiving`; variabel tidak digunakan pada `receive_product_stock`; parameter `p_is_taxable` tidak digunakan pada `create_product_with_base_unit`.

**Rekomendasi:** pada fase perbaikan terpisah, tambahkan cast `[]::jsonb` dan audit/hapus variabel/parameter hanya setelah memastikan kompatibilitas RPC. Tidak dilakukan dalam audit ini.

## Risiko potensial yang belum terbukti

| Prioritas | Risiko | Bukti/area yang perlu diukur |
|---|---|---|
| P2 | Query daftar produk mengambil beberapa tabel metadata/batch secara paralel untuk membentuk satu halaman; bukan N+1, tetapi volume transfer dapat besar. | `src/modules/catalog/data/admin-product-queries.ts`; benchmark katalog besar dan periksa batas pagination setiap query. |
| P2 | Search invoice berdasarkan pemasok membentuk daftar ID sebelum query invoice; jumlah pemasok cocok yang besar dapat memperpanjang filter URL/PostgREST. | `src/modules/purchasing/invoice-repository.ts`; uji ribuan pemasok dengan nama umum. |
| P2 | Login/session refresh, redirect role, CSRF/origin, dan revocation sesi aktif belum mendapat HTTP E2E pada audit ini karena F-03. | Auth routes, middleware/server client, employee API. |
| P2 | Layout mobile, fokus dialog, ukuran target sentuh, overflow tabel/kartu, dan pesan error untuk pengguna usia 60+ belum diverifikasi visual. | Seluruh protected UI; perlu browser nyata pada viewport desktop dan ponsel. |
| P3 | Sejumlah validasi API masih menghasilkan pesan teknis berbahasa Inggris (`invalid numeric value`, `invalid category`) bila mapping UI tidak menangkapnya. | `src/app/api/products/[id]/route.ts` dan route master data lain; uji respons gagal melalui UI. |

## Integrasi dan konsistensi yang tervalidasi

- Finalisasi pembelian memutakhirkan batch/cost secara atomik, menjaga harga jual, mendukung retry, menolak konflik opname, dan rollback pada error.
- Payment ledger invoice menolak overpayment/duplikat dan aman terhadap concurrency pada test database; test memastikan produk, unit, batch, stok, dan harga tidak berubah.
- Checkout, QRIS, receipt, void, retur, history, cashier cart, dan kalkulasi payment lulus pada unit/component suite; concurrency RPC inti lulus tanpa negative stock/deadlock.
- Stok tersedia pada product/dashboard dan inventory sama-sama mengecualikan batch yang sudah lewat tanggal bisnis; perbedaan yang ditemukan berada pada operator batas minimum (F-02).
- Dashboard menggunakan satu RPC analytics dan query low-stock teragregasi; tidak ditemukan N+1 pada section Fase 6.
- Status pembayaran invoice diturunkan dari total vs ledger, terpisah dari status draft/completed; concurrency ledger lulus.

Catatan: poin di atas adalah validasi otomatis/domain, bukan bukti alur browser lengkap.

## Fitur yang belum diuji end-to-end

1. Login/logout, refresh cookie, akun nonaktif, role/permission override, dan navigasi aktual dalam browser.
2. CRUD/import produk dari file nyata sampai hasil tampil di daftar/detail; kategori dan supplier melalui form browser.
3. Pembuatan invoice → edit item → finalisasi → pembayaran sebagian/lunas → dokumen invoice melalui UI.
4. Stock opname penuh dari form, konflik dengan penerimaan/checkout, dan tampilan low-stock lintas halaman.
5. Cash drawer → checkout cash/QRIS → receipt → void/retur dalam satu sesi UI.
6. Dashboard/report filter tanggal, harga, margin, dan HPP terhadap dataset rekonsiliasi yang sama melalui UI.
7. Desktop/mobile visual regression, keyboard/focus, screen reader labels, loading state, offline/network error, dan double-submit lambat.
8. Performa SSR pada volume produksi-representatif; audit hanya mengidentifikasi pola query, bukan load test.

## Masalah UX untuk pengguna nonteknis usia 60+

- Ketidaksamaan label stok pada nilai yang sama (F-02) dapat langsung memicu keputusan pengadaan yang salah.
- “Kelola Akses” memberi kesan perubahan berlaku global, padahal banyak route masih role-based (F-01). Teks “Belum tersedia” hanya melindungi sebagian capability dan tidak menjelaskan cakupan enforcement secara menyeluruh.
- Redirect authorization sering mengembalikan pengguna ke halaman lain tanpa penjelasan konteks; perlu diverifikasi dan diberi pesan Indonesia yang spesifik setelah HTTP E2E pulih.
- Mobile card, ukuran tombol, fokus popup, serta keterbacaan Rupiah belum dapat dinilai tanpa browser; ini merupakan gap QA, bukan klaim bug visual.
- Pesan validasi teknis berbahasa Inggris berisiko muncul pada error yang belum dimapping (risiko P3).

## Urutan rekomendasi perbaikan

1. **Pulihkan QA gate:** perbaiki runtime/transport test HTTP (F-03), lalu bangun smoke E2E auth + permission + transaksi kritis pada database disposable.
2. **Tutup gap otorisasi:** buat matriks capability dan migrasikan backend guard serta navigasi secara bertahap (F-01); uji deny/allow pada setiap route sensitif.
3. **Satukan aturan stok:** gunakan satu domain helper dan contract test lintas Products, Inventory, dan Dashboard (F-02).
4. **Isolasi test database:** perbaiki fixture pgTAP dan cleanup concurrency karyawan (F-04, F-06) agar hasil CI repeatable tanpa menyentuh data developer.
5. **Kurangi SSR overhead:** hapus query drawer yang tidak digunakan (F-05), lalu ukur dan paginasi/agregasi inventory serta query katalog/invoice berisiko (F-07 dan risiko performa).
6. **Lakukan browser QA nyata:** alur Fase 1–6, desktop/mobile, keyboard/focus, pesan error, double-submit, dan pengguna usia 60+.
7. **Bersihkan warning database dan pesan teknis** setelah isu keamanan/konsistensi selesai (F-08 dan risiko P3).

## Kesimpulan

Fondasi transaksi database dan concurrency utama menunjukkan hasil kuat pada test terisolasi, dan build statis bersih. Sistem belum layak dinyatakan “full-system QA passed” karena enforcement permission lintas modul belum konsisten, definisi low-stock berbeda antarhalaman, serta lapisan HTTP/browser belum dapat diuji pada runtime saat ini. Prioritas stabilisasi harus dimulai dari test gate dan otorisasi, lalu konsistensi stok dan performa SSR.
