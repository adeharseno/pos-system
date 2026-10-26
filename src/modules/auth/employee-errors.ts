export const EMPLOYEE_ERRORS = {
  EMPLOYEE_NOT_FOUND: [404, "Pegawai tidak ditemukan."],
  EMPLOYEE_INACTIVE: [403, "Akses pegawai tidak aktif."],
  FORBIDDEN: [403, "Anda tidak memiliki akses untuk mengelola pegawai."],
  LAST_ACTIVE_OWNER: [409, "Pemilik aktif terakhir tidak dapat dinonaktifkan atau dilepas."],
  EMAIL_CONFLICT: [409, "Email sudah digunakan. Gunakan email lain atau periksa akun yang ada."],
  ACCOUNT_ALREADY_LINKED: [409, "Pegawai atau akun sudah terhubung."],
  INVITATION_BUSY: [409, "Undangan sedang diproses. Coba lagi beberapa saat."],
  INVITATION_STALE: [409, "Undangan tidak berlaku. Minta pemilik mengirim ulang undangan."],
  REQUEST_CONFLICT: [409, "Permintaan sudah digunakan untuk data yang berbeda."],
  PROTECTED_PERMISSION: [403, "Izin pengelolaan ini hanya tersedia untuk pemilik."],
  OWNER_PERMISSIONS_PROTECTED: [403, "Izin pemilik tidak dapat diubah melalui pengaturan individu."],
  UNKNOWN_PERMISSION: [400, "Izin tidak dikenal."],
  REASON_REQUIRED: [400, "Alasan perubahan wajib diisi."],
  INVALID_OVERRIDE: [400, "Pengaturan izin tidak valid."],
  INVALID_EMPLOYEE_INPUT: [400, "Data pegawai tidak valid. Periksa kembali isian Anda."],
  PROVISIONING_FAILED: [503, "Pembuatan akun belum berhasil. Undangan dapat dicoba kembali."],
  DELIVERY_FAILED: [503, "Undangan belum berhasil dikirim. Silakan coba kembali."],
  INVITATION_CONFIG: [503, "Pengaturan alamat undangan belum siap. Hubungi pengelola aplikasi."],
} as const;
export type EmployeeErrorCode = keyof typeof EMPLOYEE_ERRORS;
export class EmployeeManagementError extends Error {
  constructor(public readonly code: EmployeeErrorCode) { super(code); }
}
