# Penyesuaian Import Produk untuk workbook enriched

Sumber audit: file pengguna `master_produk_apotek_enriched_3687.xlsx` (433.393
byte). File sumber tidak diubah. Seluruh sheet diperiksa sebagai data, tanpa
menganggap teks petunjuk dalam workbook sebagai instruksi pengerjaan.

## Audit workbook dan importer awal

Workbook memiliki empat sheet:

| Sheet | Isi | Perlakuan |
| --- | --- | --- |
| Master Produk | A1:V3688, 3.687 produk dan 22 kolom | Dibaca sebagai produk |
| PETUNJUK | A1:B27, keterangan dataset | Referensi, tidak diimpor |
| REFERENSI ONLINE | A1:G12, 11 referensi harga | Referensi, tidak diimpor |
| DAFTAR KATEGORI | A1:C23, 22 pasangan kategori/subkategori | Referensi, tidak otomatis membuat master |

Importer sebelumnya mendukung XLSX/CSV maksimal 5 MB, membaca hanya sheet
pertama, mengenali header berbahasa Indonesia/Inggris dengan spasi, membatasi
commit 500 baris, mengaktifkan setiap produk dan mengirim seluruh pratinjau
dalam satu permintaan. Seluruh baris harus valid sebelum UI bisa mengimpor.
Penyimpanan memakai `createProduct` dan RPC produk yang sudah ada, tanpa stok.

## Mapping yang diterapkan

| Kolom sumber | Field importer | Tujuan existing |
| --- | --- | --- |
| sku | sku | products.sku |
| name | name | products.name |
| category | categoryId melalui nama/pemetaan | products.category_id |
| subcategory | subcategoryId dalam kategori terpilih | products.subcategory_id |
| manufacturer | manufacturer | products.manufacturer |
| classification | drugClassification | products.drug_classification |
| unit_name | baseUnit | products.base_unit dan product_units.unit_name |
| cost_price | costPrice | products.cost_price |
| selling_price | sellingPrice | product_units.selling_price |
| barcode | barcode | product_units.barcode |
| is_active | isActive | products.is_active |

Header underscore/spasi/hyphen dan alias lama tetap dikenali. Alias Harga Beli
juga diterima sebagai harga modal. Nilai rupiah dinormalisasi hanya untuk format
yang jelas; kosong tetap dibedakan dari nol dan harga tidak valid menjadi error.
Barcode teks mempertahankan nol di depan.

`Obat Keras` dinormalisasi ke enum `prescription_required`. `Obat Bebas` dan
`Obat Bebas Terbatas` dapat dipetakan ke enum yang ada. `PERLU VERIFIKASI` tetap
error, tidak diganti dengan klasifikasi buatan. Produsen placeholder
`BELUM DIKETAHUI (DUMMY)` dikosongkan karena field produsen bersifat opsional;
3.676 placeholder tidak disimpan sebagai produsen palsu.

Kolom berikut sengaja diabaikan:

`source_no`, `margin_percent`, `opening_stock`, `price_data_status`,
`manufacturer_data_status`, `classification_data_status`, `category_data_status`,
`market_reference_price`, `reference_packaging`, `reference_url`, `review_notes`.

Margin tetap dihitung oleh logika existing, bukan disalin dari referensi.
Opening stock tidak dipakai: importer tidak membuat batch awal dan workbook
tidak menyediakan tanggal kedaluwarsa yang diperlukan untuk penerimaan stok.
Harga referensi/kemasan/URL/catatan tidak dimasukkan ke field produk lain.

Field yang tidak tersedia tetap memakai default importer existing: harga modal
opsional 0, minimum stok 0, pajak 0, supplier/lokasi kosong. Klasifikasi kosong
memakai default lama `otc`; klasifikasi eksplisit yang tidak dikenal tetap
ditolak. Bila status aktif tidak disediakan, kompatibilitas default lama true
dipertahankan. Pada workbook ini seluruh 3.687 nilai status adalah false dan
tetap false hingga jalur `createProduct`.

## Perubahan alur

- Semua sheet dengan header SKU dan Nama dikenali; sheet referensi dilewati.
  Nomor sheet/baris sumber ditampilkan. Batas pratinjau 10.000 baris dan 5 MB.
- Duplicate SKU/barcode diperiksa lintas sheet. Pemetaan subkategori dibatasi
  kategori yang benar. Tidak ada pembuatan kategori/subkategori otomatis.
- Error validasi backend dilaporkan per baris, bukan membatalkan seluruh batch.
  UI bisa mengimpor baris valid dan menandai baris belum valid sebagai dilewati.
- UI mengirim batch 50 baris. Batas endpoint 500 dipertahankan. Backend memakai
  maksimal empat panggilan `createProduct` bersamaan. Tidak ada job/queue/staging.
- Hanya adapter importer yang memanggil jalur `createProduct` existing. Tidak
  ada insert produk paralel, RPC baru atau perhitungan stok/harga baru.
- Pengecekan SKU/barcode existing dan unique constraints/RPC tetap berlaku.
  Produk existing tidak ditimpa. Duplicate dilaporkan sebagai dilewati di UI,
  dengan bentuk respons commit success/failed yang tetap kompatibel.
- Bila jaringan gagal, batch berikutnya tidak otomatis dijalankan atau diulang.
  Hasil yang telah diakui dipertahankan; retry pengguna memeriksa SKU existing.
- Preview dan hasil dipaginasi 50 baris agar tidak merender 3.687 baris sekaligus.
  Nilai asli nonaktif, kolom diabaikan, error dan hasil per baris terlihat.

## Hasil pengujian

Typecheck, lint, build: lulus. Total 41 tes unit terkait produk, impor dan
otorisasi lulus. Pengujian pipeline dengan dependency uji (bukan insert database)
memverifikasi 50 dan 3.687 baris valid, batch maksimum 50, concurrency maksimum
empat, SKU duplikat, import ulang, field wajib kosong, harga tidak valid,
metadata diabaikan dan penghentian setelah kegagalan jaringan.

Pengujian file asli memakai server hasil build, akun owner lokal dan endpoint
existing, tanpa membuat master data atau mengubah sumber:

| Pengujian API lokal | Berhasil disimpan | Gagal validasi | Durasi |
| --- | ---: | ---: | ---: |
| 50 baris pertama | 0 | 50 (48 klasifikasi, 2 pemetaan) | 242 ms |
| 3.687 baris | 0 | 3.687 (3.652 klasifikasi, 35 pemetaan) | 14.838 ms |
| Ulang file yang sama | 0 | 3.687, alasan sama | 13.786 ms |

Batch terlama pada pengujian full file 271 ms. Durasi ini mengukur validasi dan
penolakan file aktual, bukan benchmark 3.687 insert sukses. Pengujian tanpa sesi
ditolak 401. Jumlah produk dan batch lokal tetap sama; tidak ada stok dibuat.

### Kendala data yang masih harus diselesaikan

- Database lokal belum memiliki kategori/subkategori. Semua 3.687 baris belum
  memiliki pemetaan ke master yang sah. Gunakan kategori/subkategori yang benar
  melalui fitur existing, lalu pilih pemetaan/periksa ulang berkas.
- Sebanyak 3.652 klasifikasi PERLU VERIFIKASI harus diisi dengan klasifikasi
  nyata yang sudah diverifikasi. Importer sengaja tidak menebaknya.
- Workbook menandai harga sebagai dummy/referensi. Status nonaktif dipertahankan;
  harga/varian/produsen perlu diverifikasi sebelum aktivasi operasional.
- Karena kendala tersebut, tidak ada klaim bahwa 3.687 produk berhasil masuk ke
  database. Insert sukses skala penuh melalui RPC lokal belum diuji dengan data
  sumber aktual yang valid; jalur batching/duplikat diuji dengan dependency uji.
- Browser tidak terhubung; visual/interaksi mobile dan tombol impor belum diuji
  dalam browser. Pengujian API dan rendering dilakukan terpisah.

## File source yang diubah

- `src/modules/catalog/application/preview-product-import.ts`
- `src/modules/catalog/application/commit-product-import.ts`
- `src/modules/catalog/application/product-import-commit.ts` (core validasi/alur uji)
- `src/modules/catalog/import-batches.ts`
- `src/modules/catalog/components/product-import-preview.tsx`
- `src/app/api/products/import/preview/route.ts` (menambah info audit pratinjau)
- `src/modules/catalog/product-import-preview.test.ts`
- `src/modules/catalog/product-import-commit.test.ts`
- `supabase/tests/product-import-local.cjs`
- `docs/product-import-enriched.md`

Tidak ada perubahan schema, migration, RPC, kontrak produk, form Tambah/Edit,
otorisasi, checkout, harga atau logika stok. Tidak ada dependency baru, akses
Supabase produksi, branch baru, push atau deployment. Perubahan UI daftar/detail
yang sudah dikerjakan sebelum permintaan importer dicatat terpisah.

Tes file aktual dapat diulang dengan app lokal berjalan dan environment
`LOCAL_IMPORT_TEST_URL`, `LOCAL_IMPORT_TEST_EMAIL`, `LOCAL_IMPORT_TEST_PASSWORD`,
`PRODUCT_IMPORT_FILE`, lalu:

```text
node --env-file=.env.local supabase/tests/product-import-local.cjs
```

Script menolak host non-lokal. Script dapat menyimpan baris yang benar-benar
valid jika master/berkas sudah diperbaiki; jalankan hanya di database lokal uji.
