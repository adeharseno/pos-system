# Penyederhanaan UI untuk pengguna usia 60+

Pembaruan berikutnya menghapus seluruh tindakan cepat beranda dan menambahkan
Beranda ke sidebar. Lihat [Dashboard dan transaksi](dashboard-transactions-redesign.md)
untuk keadaan UI terbaru. Catatan di bawah menjelaskan tahap penyederhanaan awal.

Perubahan dilakukan pada branch lokal yang sama, melanjutkan desain TailAdmin.

## Perubahan utama

- Sidebar: menu Retur dihapus, tujuh menu inti dan penyaringan peran tetap.
  Label navigasi diperbesar dengan area klik minimal 56 px.
- Header semua halaman dalam app shell: hanya nama halaman dan profil pengguna.
  Subjudul Cipayung Farma dan badge sesi kasir dihapus. Kartu status dekoratif
  pada bagian bawah sidebar juga dihapus.
- Profil: klik nama/avatar untuk membuka dropdown sederhana berisi nama, peran,
  dan Keluar. Tetap memakai server action logout yang ada. Mendukung Escape,
  klik di luar, perpindahan fokus dan penutupan saat fokus keluar.
- Branding sidebar/login: Apotek Cipayung Farma, tanpa subjudul sistem kasir.
  Logo gambar tetap dipertahankan.
- Beranda: empat kartu utama saja—Penjualan Bersih, Jumlah Transaksi, Total
  Retur, dan Laba Kotor. Metrik tambahan tidak dirender.
- Visualisasi: satu grafik Penjualan Bulanan dan daftar Produk Terlaris.
  Grafik harian, metode pembayaran, detail SKU/nilai produk, badge berulang,
  dan paragraf penjelasan panjang tidak ditampilkan.
- Lima tindakan cepat Pemilik: Penjualan Baru, Kelola Sesi Kasir, Stok Masuk,
  Daftar Barang, Persediaan. Kasir hanya mendapat tindakan yang diizinkan.
  Tombol Tambah Produk dan kartu tindakan duplikat pada tampilan operasional
  dihapus. Akun Staf tetap memperoleh sambutan dan arahan kerja.
- Pilihan periode tetap tersedia. Teks zona waktu tidak ditampilkan lagi;
  aturan tanggal Asia/Jakarta tetap berlaku. Tahun grafik tetap terpisah.
- Tipografi global: isi utama 18 px, teks kecil 15–16 px, heading lebih besar,
  warna sekunder lebih kontras. Input, Select, Button dan Checkbox bersama
  memiliki area interaksi minimal 52 px. Jarak antarelemen diperbesar.
- Grafik: label lebih besar, garis bantu lebih sedikit, nilai bulan terpilih
  jelas, rincian bulanan tersedia melalui bagian lipat. Pada layar kecil grafik
  dapat digeser horizontal tanpa memperkecil teks.
- Skeleton mengikuti empat kartu dan satu grafik. Ukuran teks struk cetak
  dipertahankan melalui override khusus print agar tidak mengikuti pembesaran
  teks layar. Workspace kasir tetap layar penuh.

## File yang diubah dalam penyederhanaan ini

- `src/app/globals.css`
- `src/app/(auth)/login/page.tsx`
- `src/app/(protected)/dashboard/page.tsx`
- `src/modules/ui/app-shell.tsx`
- `src/modules/ui/components.tsx`
- `src/modules/ui/user-menu.tsx` (baru)
- `src/modules/ui/modal.tsx`
- `src/modules/dashboard/dashboard-model.ts` (hanya daftar tindakan UI)
- `src/modules/dashboard/dashboard-charts.tsx`
- `src/modules/dashboard/dashboard-skeleton.tsx`
- `supabase/tests/dashboard-ui.cjs` (menyesuaikan pemeriksaan UI yang ada)
- `docs/dashboard-redesign.md`
- `docs/ui-sederhana-60-plus.md`

API, RPC, migrasi, perhitungan laporan, layanan data dan permission backend tidak
diubah. Data yang tidak ditampilkan tetap tersedia melalui laporan yang ada.
Menu Retur di workspace kasir dan fungsi retur tetap tersedia; yang dihapus
hanya menu sidebar. Tidak ada dependency baru, push, atau deployment.

## Validasi

- `npm run typecheck`: lulus.
- `npm run lint`: lulus.
- `npm run build`: lulus.
- 27 tes dashboard, pelaporan, autentikasi dan otorisasi: lulus.
- Pemeriksaan HTTP terautentikasi: empat metrik sesuai `/reports` untuk Hari
  Ini, Minggu Ini, Bulan Ini dan rentang khusus. Elemen yang dihapus tidak
  dirender, branding/profil tersedia, dan empty state, tanggal tidak valid serta
  redirect pengguna tanpa sesi tetap bekerja.
- Pemeriksaan visual/interaksi browser desktop/mobile belum dilakukan:
  inventaris browser pada sesi ini kosong. Dropdown profil, zoom, navigasi
  keyboard, scrolling grafik dan cetak struk masih perlu pemeriksaan visual.
