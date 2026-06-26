# CLAUDE.md — Konteks Proyek POS Apotek (Pilot 1)

Ini adalah entry point konteks untuk AI/coding agent yang bekerja di repo ini. Baca file ini dulu sebelum menyentuh kode. Dokumen detail ada di `docs/`, **jangan baca semuanya sekaligus** — rujuk hanya file yang relevan dengan task yang sedang dikerjakan (lihat tabel "Kapan baca file mana" di bawah).

## Ringkasan Proyek

POS (Point of Sale) untuk apotek, Pilot 1. Fokus: kasir, manajemen produk farmasi (multi-unit, multi-batch, FEFO), laporan dasar. Sengaja sederhana & murah — lihat `docs/roadmap.md` bagian "Hal yang Sengaja Tidak Didesain" sebelum menambahkan fitur yang tidak diminta (approval workflow, payment gateway, multi-cabang, RBAC granular, PO/GR, payroll/CRM — semua itu **di luar lingkup**, jangan diimplementasikan kecuali diminta eksplisit).

## Tech Stack

- **Next.js (App Router)** — frontend + backend (API Routes) dalam satu codebase
- **Supabase** — Postgres, Auth, Storage
- **Vercel** — hosting, serverless function

## Aturan Krusial (sering dilanggar, jangan dilanggar)

1. **Supabase client harus dibuat di dalam request handler**, bukan di top-level module — lihat `docs/folder-structure.md` § 8.2. Top-level instance akan bocor antar user di serverless Vercel.
2. **Role disimpan di Supabase Auth `app_metadata.role`** (`owner_admin` | `kasir`), bukan tabel `roles`/`permissions`. Jangan buat tabel RBAC baru.
3. **Checkout harus pakai `FOR UPDATE` row lock** saat mengambil batch FEFO — lihat `docs/business-logic.md` § 7.1. Tanpa ini bisa oversell saat 2 kasir checkout produk sama bersamaan.
4. **`transaction_items` = 1 baris per batch sumber**, bukan 1 baris per produk. Jika 1 item checkout butuh ambil dari 2 batch, tulis 2 baris.
5. **Retur pelanggan selalu balik ke batch ASAL** (dari `transaction_item_id`), tidak membuat batch baru.
6. **Stok dikurangi saat checkout dibuat**, bukan saat konfirmasi QRIS — supaya stok tidak "terkunci" untuk transaksi QRIS yang batal.
7. Akses Supabase dari client (browser) di-deny via RLS; semua query produksi lewat `service_role` di API Route. Jangan query Supabase langsung dari client component untuk data transaksional.

## Kapan Baca File Mana

| Sedang ngerjain... | Baca |
|---|---|
| Tabel/kolom, relasi, RLS, role model | `docs/database-design.md` |
| Bikin/ubah endpoint API | `docs/api-contract.md` |
| Logic checkout, void, retur, opname, laporan | `docs/business-logic.md` |
| Folder mana taruh file, env vars, init Supabase client | `docs/folder-structure.md` |
| Requirement asli / kenapa suatu fitur ada-tidak-ada | `docs/prd.md` |
| Urutan kerja, fitur yang sengaja belum didesain | `docs/roadmap.md` |

## Status Implementasi

- Migration SQL sudah ada dan executable: `supabase/migrations/0001_init.sql` (schema) dan `0002_rls_policies.sql` (RLS). Belum dijalankan ke project Supabase manapun.
- Belum ada kode aplikasi (Next.js project belum di-scaffold). Belum ada `package.json`, `app/`, `lib/`, `types/`.
- Belum ada seed data (`0003_seed.sql` direncanakan, belum dibuat).

Urutan pengerjaan ikuti `docs/roadmap.md` (Tahap 1–6). Tahap 1 = jalankan kedua migration ini ke project Supabase baru, lalu scaffold project Next.js sesuai `docs/folder-structure.md`.
