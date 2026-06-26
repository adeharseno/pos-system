# Business Logic / Algoritma Kunci — POS Apotek (Pilot 1)

> Pseudocode yang dijalankan di dalam API Route. Lihat `api-contract.md` untuk endpoint terkait dan `database-design.md` untuk skema tabel.

## 7. Algoritma Bisnis Kunci (pseudocode, dijalankan di API Route)

### 7.1 Checkout — FEFO + Validasi (inti dari `POST /api/transactions/checkout`)

```
BEGIN TRANSACTION (Postgres, via supabase service-role client di dalam request handler)

1. Ambil semua product_units & products terkait item di request (join sekali, hindari N+1).
2. Hitung quantity_in_base utk tiap item = qty_input * product_units.conversion_to_base.
3. Cek requires_prescription: jika ada item yg true DAN body.prescription kosong → return 422 PRESCRIPTION_REQUIRED.
4. Untuk setiap item:
     a. SELECT batches WHERE product_id = X AND quantity > 0 AND expired_date >= CURRENT_DATE
        ORDER BY expired_date ASC FOR UPDATE  -- row lock, cegah race condition antar transaksi paralel
     b. Jika total quantity batch < quantity_in_base dibutuhkan → ROLLBACK, return 409 INSUFFICIENT_STOCK
     c. Alokasikan secara berurutan (FEFO):
          remaining = quantity_in_base
          for batch in batches:
            taken = min(batch.quantity, remaining)
            -> simpan baris transaction_item { batch_id: batch.id, quantity_in_base: taken, cost_price_snapshot: batch.cost_price, ... }
            UPDATE product_batches SET quantity = quantity - taken WHERE id = batch.id
            remaining -= taken
            if remaining == 0: break
5. Hitung subtotal, tax_amount (per item: subtotal_item * tax_rate jika is_taxable), total_amount.
6. Jika payment_method == 'cash':
     - validasi cash_received >= total_amount, hitung cash_change.
     - status = 'completed'
   Jika payment_method == 'qris':
     - status = 'completed' tapi payment_confirmed_at = NULL
     - (stok TETAP dikurangi di langkah 4 -- keputusan desain: stok dikurangi saat checkout dibuat,
       bukan saat konfirmasi, supaya tidak ada 2 kasir berebut stok yg sama saat "menunggu scan QRIS pelanggan")
7. INSERT transactions, transaction_items, transaction_prescriptions (jika ada).
8. INSERT/UPDATE tidak menyentuh cash_drawer_sessions di sini (saldo dihitung on-the-fly saat closing, lihat 7.5).

COMMIT TRANSACTION
9. Return response dengan breakdown items per batch.
```

> **Mengapa row lock (`FOR UPDATE`)**: dua kasir bisa checkout produk yang sama dalam waktu hampir bersamaan; tanpa lock, keduanya bisa membaca stok batch yang sama sebelum salah satu commit, menyebabkan oversell. `FOR UPDATE` pada baris `product_batches` yang relevan mencegah ini di level database.

### 7.2 Void Transaksi

```
1. Load transaction by id; jika status != 'completed' -> 409 ALREADY_VOIDED.
2. BEGIN TRANSACTION
3. Untuk setiap transaction_items pada transaksi ini:
     UPDATE product_batches SET quantity = quantity + quantity_in_base WHERE id = batch_id
4. UPDATE transactions SET status='voided', voided_at=now(), voided_by=:employee_id, void_reason=:reason
5. COMMIT
   (Tidak ada approval — langsung diterapkan, sesuai PRD 4.2.7. Tercatat siapa & kapan untuk audit pasif Owner/Admin.)
```

### 7.3 Cetak Struk

`GET /api/transactions/:id/receipt` mengembalikan JSON terstruktur (bukan biner ESC/POS) berisi header toko, daftar item+unit+qty+harga, subtotal, pajak, total, metode bayar, kembalian. Konversi ke command ESC/POS dilakukan di **client-side** (browser, via Web Serial/WebUSB atau local print service) menggunakan library seperti `escpos`/`node-thermal-printer` yang dijalankan dari proses lokal kasir — server Next.js tidak berkomunikasi langsung dengan printer (sesuai 2.1: cetak dari browser kasir).

### 7.4 Retur

```
RETUR PELANGGAN (source=customer):
1. Load transaction_item_id -> dapatkan batch_id ASAL (tempat item ini diambil saat checkout).
2. Validasi quantity_in_base retur <= quantity_in_base pada transaction_item tersebut (tidak overretur).
3. BEGIN TRANSACTION
   UPDATE product_batches SET quantity = quantity + qty WHERE id = batch_id_asal
   INSERT returns, return_items
4. COMMIT
   (Stok selalu balik ke batch ASAL, bukan batch baru -- sesuai PRD 5.9)

RETUR SUPPLIER (source=supplier):
1. Validasi product_id+batch_id ada dan quantity batch cukup.
2. BEGIN TRANSACTION
   UPDATE product_batches SET quantity = quantity - qty WHERE id = batch_id
   INSERT returns, return_items
3. COMMIT
   (Tidak memengaruhi laporan penjualan -- hanya pengurangan stok)
```

### 7.5 Cash Drawer Close

```
closing_balance_expected = opening_balance
                          + SUM(transactions.cash_received - transactions.cash_change)
                            WHERE cash_drawer_session_id = :id AND payment_method='cash' AND status='completed'
variance = closing_balance_actual (input kasir) - closing_balance_expected
UPDATE cash_drawer_sessions SET closing_balance_expected=.., closing_balance_actual=.., variance=.., closed_at=now()
```

### 7.6 Laporan Laba-Rugi

```
total_sales    = SUM(transactions.total_amount) WHERE status='completed' AND created_at BETWEEN from/to
total_hpp      = SUM(transaction_items.quantity_in_base * transaction_items.cost_price_snapshot)
                   JOIN transactions WHERE status='completed' AND created_at BETWEEN from/to
total_expenses = SUM(operational_expenses.amount) WHERE expense_date BETWEEN from/to
net_profit     = total_sales - total_hpp - total_expenses
```
(`total_sales` di atas sudah termasuk pajak; jika ingin omset bersih sebelum pajak, kurangi `tax_amount` — sesuaikan definisi dengan Owner saat implementasi, lihat Open Question 10.1 PRD terkait granularitas laporan.)

### 7.7 Stock Opname Apply

```
FOR each stock_opname_items WHERE session_id = :id:
  IF batch_id IS NOT NULL:
    UPDATE product_batches SET quantity = physical_quantity WHERE id = batch_id
  ELSE:
    -- tidak teridentifikasi per-batch: terapkan selisih ke batch FEFO teraktif (expired_date terdekat)
    -- sebagai pendekatan paling sederhana di Pilot 1
    apply variance ke batch FEFO terdekat product tersebut
UPDATE stock_opname_sessions SET status='applied', applied_at=now(), applied_by=:employee_id
```

---

