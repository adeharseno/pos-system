export function employeeFormError(input: { name: string; email: string; phone: string; date: string; reason: string; needsEmail: boolean }): string | null {
  if (!input.name.trim() || input.name.trim().length > 150) return "Isi nama lengkap karyawan, maksimal 150 karakter.";
  if (input.needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Isi alamat email yang benar untuk mengirim undangan.";
  if (input.phone.length > 40) return "Nomor telepon terlalu panjang. Gunakan maksimal 40 karakter.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) return "Isi tanggal bergabung yang benar.";
  if (!input.reason.trim() || input.reason.length > 500) return "Isi alasan perubahan, maksimal 500 karakter.";
  return null;
}
export function passwordSetupError(password: string, confirmation: string): string | null {
  if (password.length < 12 || password.length > 128) return "Gunakan kata sandi sepanjang 12 hingga 128 karakter.";
  if (password !== confirmation) return "Kedua kata sandi belum sama. Periksa kembali.";
  return null;
}
