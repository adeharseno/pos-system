# Panduan Shortcut Keyboard Kasir

Halaman Kasir dapat digunakan tanpa mouse. Shortcut hanya bekerja pada konteks yang sesuai dan tidak mengambil alih pengetikan di kolom input.

## Pencarian produk

| Tombol | Fungsi |
|---|---|
| `/` atau `?` | Fokus ke pencarian produk ketika fokus tidak sedang berada di input lain. Jika pencarian sudah fokus, karakter tetap dapat diketik seperti biasa. |
| `↑` / `↓` | Memilih hasil jual sebelumnya/berikutnya. Produk atau satuan yang stoknya habis atau belum memiliki harga dilewati. |
| `PgUp` / `PgDn` | Berpindah lima hasil jual sekaligus. |
| `Enter` | Menambahkan hasil yang dipilih. Jika belum ada hasil yang dipilih, menjalankan pencarian barcode seperti sebelumnya. |
| `Esc` | Membatalkan pilihan hasil tanpa menghapus kata pencarian. |

Setelah produk ditambahkan, fokus berpindah ke jumlah item tersebut dan seluruh angka jumlah terseleksi. Ketik jumlah baru lalu tekan `Enter` untuk menyimpan. Jumlah tidak dapat melebihi stok tersedia setelah memperhitungkan konversi dan satuan lain dari produk yang sama. Penekanan `Enter` berulang saat tombol masih ditahan diabaikan.

## Keranjang

| Tombol | Fungsi |
|---|---|
| `Alt+Q` | Membuka input jumlah pada item terakhir. |
| `Alt+↑` / `Alt+↓` | Berpindah ke input jumlah item keranjang sebelumnya/berikutnya. |
| Angka | Mengganti jumlah ketika input jumlah aktif. |
| `+` / `-` | Menambah atau mengurangi satu jumlah item aktif. Jumlah minimum tetap satu. |
| `Enter` | Menyimpan jumlah yang diketik. |
| `/` atau `?` | Dari input jumlah, kembali ke pencarian tanpa memasukkan karakter. |
| `F2` | Membuka pemeriksaan pesanan biasa. Hanya aktif jika keranjang berisi barang. |
| `Shift+F2` | Membuka pesanan BPJS, termasuk alur produk tambahan BPJS. |

## Modal pembayaran

| Tombol | Fungsi |
|---|---|
| `Alt+1` / `Alt+2` / `Alt+3` | Memilih kategori BEBAS / UMUM / BPJS. Pembatasan mode BPJS tetap berlaku. |
| `Alt+T` / `Alt+R` / `Alt+B` / `Alt+O` | Memilih Tunai / QRIS / Transfer Bank / TEMPO. Tidak berlaku ketika kategori BPJS aktif. |
| `Alt+U` | Fokus ke Uang Diterima jika metode Tunai aktif. |
| `Ctrl+Enter` | Menjalankan tombol konfirmasi. Validasi, disabled state, dan pengunci double-submit tetap berlaku. |
| `Esc` | Menutup modal jika tidak sedang memproses. Pada daftar pelanggan TEMPO, `Esc` pertama menutup daftar pelanggan. |
| `Tab` / `Shift+Tab` | Berpindah antarkontrol form. |
| `Enter` / `Space` | Mengaktifkan tombol yang sedang mendapat fokus. |

## Popup transaksi berhasil

| Tombol | Fungsi |
|---|---|
| `Enter` | Memulai Transaksi Baru dan mengembalikan fokus ke pencarian. |
| `F3` | Menjalankan tombol Cetak Struk/Cetak Invoice. Tombol tetap menunggu receipt siap dan mencegah print bersamaan. |
| `F4` | Membuka halaman Struk/Invoice. |

## Catatan Chrome kiosk pada Windows 11

- `F3` secara bawaan digunakan Chrome untuk **Find next**, dan `F4` dapat memfokuskan address bar. Halaman memanggil `preventDefault()`, tetapi shortcut yang ditangani browser/OS lebih dahulu dapat berbeda menurut kebijakan kiosk, keyboard, atau konfigurasi Windows.
- `Alt` dapat mengaktifkan menu browser pada sebagian konfigurasi Chrome non-kiosk. Kombinasi halaman tetap dicegah ketika event sampai ke aplikasi.
- Jika `F3` atau `F4` tidak diteruskan oleh Chrome kiosk, gunakan `Tab` ke tombol **Cetak Struk** atau **Lihat Struk**, lalu tekan `Enter`/`Space`.
- Shortcut tidak diproses ketika tombol ditahan (`repeat`) untuk mencegah tambah barang, checkout, atau cetak ganda.

