"use client";
import { useState, type FormEvent } from "react";
import { Button, Checkbox, FormActions, FormField, Input, Label, Select, Textarea } from "@/modules/ui/components";
import type { EmployeeRow, PermissionCatalog } from "../employee-ui-model";
import { ROLE_LABELS } from "../employee-ui-model";
import type { EmployeeRole } from "../types";
import { PERMISSION_LABELS } from "../permission-labels";
import { employeeRequest, uiError } from "./employee-request";
import { employeeFormError } from "../employee-form-rules";

export function EmployeeForm({ employee, catalog, protectedOwner, onSaved, onCancel, onBusyChange }: {
  employee: EmployeeRow | null; catalog: PermissionCatalog; protectedOwner: boolean;
  onSaved: (message: string) => void; onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [name, setName] = useState(employee?.full_name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [role, setRole] = useState<EmployeeRole>(employee?.position ?? "staf");
  const [date, setDate] = useState(employee?.join_date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()));
  const [active, setActive] = useState(employee?.is_active ?? true);
  const [reason, setReason] = useState(employee ? "" : "Penambahan karyawan");
  const [requestId] = useState(() => crypto.randomUUID());
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const createsAccount = !employee && active;
  async function save() {
    if (busy) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      if (employee) {
        await employeeRequest(`/api/employees/${employee.id}`, "PATCH", { full_name: name, phone: phone || null, join_date: date, reason });
        if (role !== employee.position) await employeeRequest(`/api/employees/${employee.id}/role`, "PATCH", { position: role, reason });
        if (active !== employee.is_active) await employeeRequest(`/api/employees/${employee.id}/access`, "PATCH", { is_active: active, reason });
      } else {
        let id = createdId;
        if (!id) {
          const result = await employeeRequest<{ employee_id: string }>("/api/employees", "POST", {
            request_id: requestId, full_name: name, phone: phone || null, position: role, join_date: date, reason,
          });
          id = result.employee_id; setCreatedId(id);
        }
        if (active) await employeeRequest(`/api/employees/${id}/invite`, "POST", { email });
        else await employeeRequest(`/api/employees/${id}/access`, "PATCH", { is_active: false, reason });
      }
      onSaved(employee ? "Data karyawan berhasil disimpan." : active ? "Karyawan ditambahkan dan undangan berhasil dikirim." : "Karyawan ditambahkan dengan status tidak aktif. Aktifkan untuk mengirim undangan.");
    } catch (cause) { setError(uiError(cause)); setConfirm(false); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    const validation = employeeFormError({ name, email, phone, date, reason, needsEmail: createsAccount });
    if (validation) return setError(validation);
    if (employee && (employee.is_active && !active || employee.position === "owner_admin" && role !== "owner_admin")) setConfirm(true);
    else void save();
  }
  return <form onSubmit={submit} noValidate className="grid gap-5">
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{createdId ? "Data karyawan sudah tersimpan. " : ""}{error} Isian Anda tetap tersimpan di formulir ini.</p>}
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      <FormField><Label htmlFor="employee-name">Nama lengkap</Label><Input id="employee-name" value={name} onChange={e => setName(e.target.value)} readOnly={Boolean(createdId)} autoComplete="name" maxLength={150} autoFocus required /></FormField>
      <FormField><Label htmlFor="employee-email">Email untuk login</Label><Input id="employee-email" type="email" value={email} onChange={e => setEmail(e.target.value)} readOnly={Boolean(employee)} disabled={!employee && !active} autoComplete="email" required={createsAccount} />
        <p className="text-xs text-[var(--text-muted)]">{employee ? employee.email ? "Email akun terhubung tidak dapat diubah di formulir ini." : "Gunakan Kirim Undangan untuk menghubungkan akun login." : active ? "Undangan untuk mengatur kata sandi akan dikirim ke email ini." : "Aktifkan karyawan terlebih dahulu untuk membuat akun login."}</p></FormField>
      <FormField><Label htmlFor="employee-phone">Telepon (opsional)</Label><Input id="employee-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} readOnly={Boolean(createdId)} autoComplete="tel" maxLength={40} /></FormField>
      <FormField><Label htmlFor="employee-date">Tanggal bergabung</Label><Input id="employee-date" type="date" value={date} onChange={e => setDate(e.target.value)} readOnly={Boolean(createdId)} required /></FormField>
      <FormField><Label htmlFor="employee-role">Posisi / Peran</Label><Select id="employee-role" value={role} onChange={e => setRole(e.target.value as EmployeeRole)} disabled={protectedOwner || Boolean(createdId)}>
        {Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></FormField>
      <FormField><Label>Status karyawan</Label><Checkbox label="Aktif" checked={active} onChange={e => setActive(e.target.checked)} disabled={protectedOwner || Boolean(createdId)} /></FormField>
    </fieldset>
    {protectedOwner && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Pemilik aktif terakhir harus tetap aktif dan berperan sebagai pemilik. Siapkan pemilik lain dengan akun aktif sebelum mengubah akses ini.</p>}
    <details className="rounded border border-[var(--border)] p-3 text-sm"><summary className="cursor-pointer font-medium">Izin bawaan {ROLE_LABELS[role]}</summary>
      <p className="my-2 text-[var(--text-muted)]">Peran memberikan izin awal berikut. Pengaturan individu dapat dikelola melalui Kelola Akses.</p>
      <ul className="grid list-inside list-disc gap-1 sm:grid-cols-2">{catalog.presets[role].map(code => <li key={code}>{PERMISSION_LABELS[code].label}</li>)}</ul>
    </details>
    <FormField><Label htmlFor="employee-reason">Alasan {employee ? "perubahan" : "penambahan"}</Label><Textarea id="employee-reason" value={reason} onChange={e => setReason(e.target.value)} disabled={busy} maxLength={500} required /></FormField>
    {confirm && <section role="alert" className="grid gap-3 rounded border border-amber-300 bg-amber-50 p-4 text-sm"><h3 className="font-semibold">Konfirmasi perubahan akses</h3><p>{!active ? "Karyawan tidak dapat menggunakan aplikasi setelah dinonaktifkan, termasuk sesi yang masih terbuka." : "Karyawan akan kehilangan hak pengelolaan sebagai pemilik."}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Kembali ke Formulir</Button><Button type="button" variant="danger" onClick={() => void save()} disabled={busy}>{busy ? "Menyimpan…" : "Ya, Ubah Akses"}</Button></div></section>}
    <FormActions><Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Tutup</Button>{!confirm && <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : createdId ? "Coba Lagi" : !employee && active ? "Simpan & Kirim Undangan" : "Simpan Karyawan"}</Button>}</FormActions>
  </form>;
}
