# Roadmap Implementasi & Batasan Lingkup — POS Apotek (Pilot 1)

## 9. Checklist Implementasi Sesuai Roadmap PRD (Bagian 9.2)

| Tahap | Yang Dikerjakan dari Dokumen Ini |
|---|---|
| 1 | Migration `0001_init.sql` (Bagian 3) lengkap + `0002_rls_policies.sql` (Bagian 4) + seed kategori/lokasi dasar |
| 2 | `lib/pos/fefo.ts`, endpoint `checkout`, `void`, UI kasir + scanner + cetak struk |
| 3 | Endpoint `qris-upload-url`, `settings`, `confirm-payment`, modal QRIS di UI kasir |
| 4 | Endpoint `stock-opname/*`, `returns/*`, `stock/expiring` |
| 5 | Endpoint `reports/*`, `dashboard/summary` |
| 6 | Endpoint `employees`, `shifts`, `attendances`, `cash-drawer/*`, dua role di `middleware.ts` |

---

## 10. Hal yang Sengaja Tidak Didesain (selaras PRD Bagian 1.4 & 9)

Tidak ada tabel/endpoint untuk: payment gateway reference, approval workflow (submit-review-decide), Purchase Order/Goods Receipt, offline sync queue, permission matrix granular, payroll, loyalty/CRM, `outlet_id`/multi-cabang. Saat fitur-fitur ini dibutuhkan di Pilot 2, lihat mitigasi & trade-off yang sudah dicatat di Bagian 9.3 PRD sebagai titik awal desain skema barunya.
