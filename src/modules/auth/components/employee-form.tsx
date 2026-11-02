"use client";
import { useState, type FormEvent } from "react";
import { Button, Checkbox, FormActions, FormField, Input, Label, Select, Textarea } from "@/modules/ui/components";
import type { EmployeeRow, PermissionCatalog } from "../employee-ui-model";
import { ROLE_LABELS } from "../employee-ui-model";
import type { EmployeeRole } from "../types";
import { PERMISSION_LABELS } from "../permission-labels";
import { employeeRequest, uiError } from "./employee-request";
import { employeeFormError, employeePasswordError } from "../employee-form-rules";

export function EmployeeForm({ employee, catalog, protectedOwner, onSaved, onCancel, onBusyChange }: {
  employee: EmployeeRow | null; catalog: PermissionCatalog; protectedOwner: boolean;
  onSaved: (message: string) => void; onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [name, setName] = useState(employee?.full_name ?? "");
  const [username, setUsername] = useState(employee?.username ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [role, setRole] = useState<EmployeeRole>(employee?.position ?? "staf");
  const [date, setDate] = useState(employee?.join_date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()));
  const [active, setActive] = useState(employee?.is_active ?? true);
  const [reason, setReason] = useState(employee ? "" : "Penambahan karyawan");
  const [requestId] = useState(() => crypto.randomUUID());
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const isCreate = !employee;
  async function save() {
    if (busy) return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      if (employee) {
        await employeeRequest(`/api/employees/${employee.id}`, "PATCH", { full_name: name, username, phone: phone || null, join_date: date, reason });
        if (role !== employee.position) await employeeRequest(`/api/employees/${employee.id}/role`, "PATCH", { position: role, reason });
        if (active !== employee.is_active) await employeeRequest(`/api/employees/${employee.id}/access`, "PATCH", { is_active: active, reason });
        onSaved("Data karyawan berhasil disimpan.");
      } else {
        if (!createdId) {
          const result = await employeeRequest<{ employee_id: string }>("/api/employees/account", "POST", {
            request_id: requestId, full_name: name, username, email, password, phone: phone || null, position: role, join_date: date, reason,
          });
          setCreatedId(result.employee_id);
        }
        onSaved("Karyawan berhasil ditambahkan.");
      }
    } catch (cause) { setError(uiError(cause)); setConfirm(false); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    const validation = employeeFormError({ name, username, email, phone, date, reason, needsEmail: isCreate }) ??
      (isCreate ? employeePasswordError(password) : null);
    if (validation) return setError(validation);
    if (employee && (employee.is_active && !active || employee.position === "owner_admin" && role !== "owner_admin")) setConfirm(true);
    else void save();
  }
  return <form onSubmit={submit} noValidate className="grid gap-5">
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{createdId ? "Data karyawan sudah tersimpan. " : ""}{error} Isian Anda tetap tersimpan di formulir ini.</p>}
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      <FormField><Label htmlFor="employee-name">Nama Karyawan</Label><Input id="employee-name" value={name} onChange={e => setName(e.target.value)} readOnly={Boolean(createdId)} autoComplete="name" maxLength={150} autoFocus required /></FormField>
      <FormField><Label htmlFor="employee-username">Username</Label><Input id="employee-username" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} readOnly={Boolean(createdId)} autoComplete="username" pattern="[a-z0-9._-]{3,30}" minLength={3} maxLength={30} required /></FormField>
      <FormField><Label htmlFor="employee-email">Email</Label><Input id="employee-email" type="email" value={email} onChange={e => setEmail(e.target.value)} readOnly={Boolean(employee) || Boolean(createdId)} autoComplete="email" required={isCreate} /></FormField>
      {isCreate && <FormField><Label htmlFor="employee-password">Password</Label><Input id="employee-password" type="password" value={password} onChange={e => setPassword(e.target.value)} readOnly={Boolean(createdId)} autoComplete="new-password" minLength={4} required /></FormField>}
      <FormField><Label htmlFor="employee-phone">No Hp</Label><Input id="employee-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} readOnly={Boolean(createdId)} autoComplete="tel" maxLength={40} placeholder="Opsional" /></FormField>
      <FormField><Label htmlFor="employee-date">Tanggal Bergabung</Label><Input id="employee-date" type="date" value={date} onChange={e => setDate(e.target.value)} readOnly={Boolean(createdId)} required /></FormField>
      <FormField><Label htmlFor="employee-role">Posisi</Label><Select id="employee-role" value={role} onChange={e => setRole(e.target.value as EmployeeRole)} disabled={protectedOwner || Boolean(createdId)}>
        {Object.entries(ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></FormField>
      {!isCreate && <FormField><Label>Status karyawan</Label><Checkbox label="Aktif" checked={active} onChange={e => setActive(e.target.checked)} disabled={protectedOwner || Boolean(createdId)} /></FormField>}
    </fieldset>
    {!isCreate && protectedOwner && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Pemilik aktif terakhir harus tetap aktif dan berperan sebagai pemilik. Siapkan pemilik lain dengan akun aktif sebelum mengubah akses ini.</p>}
    {!isCreate && <details className="rounded border border-[var(--border)] p-3 text-sm"><summary className="cursor-pointer font-medium">Izin bawaan {ROLE_LABELS[role]}</summary>
      <p className="my-2 text-[var(--text-muted)]">Peran memberikan izin awal berikut. Pengaturan individu dapat dikelola melalui Kelola Akses.</p>
      <ul className="grid list-inside list-disc gap-1 sm:grid-cols-2">{catalog.presets[role].map(code => <li key={code}>{PERMISSION_LABELS[code].label}</li>)}</ul>
    </details>}
    {!isCreate && <FormField><Label htmlFor="employee-reason">Alasan perubahan</Label><Textarea id="employee-reason" value={reason} onChange={e => setReason(e.target.value)} disabled={busy} maxLength={500} required /></FormField>}
    {confirm && <section role="alert" className="grid gap-3 rounded border border-amber-300 bg-amber-50 p-4 text-sm"><h3 className="font-semibold">Konfirmasi perubahan akses</h3><p>{!active ? "Karyawan tidak dapat menggunakan aplikasi setelah dinonaktifkan, termasuk sesi yang masih terbuka." : "Karyawan akan kehilangan hak pengelolaan sebagai pemilik."}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>Kembali ke Formulir</Button><Button type="button" variant="danger" onClick={() => void save()} disabled={busy}>{busy ? "Menyimpan…" : "Ya, Ubah Akses"}</Button></div></section>}
    <FormActions><Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Tutup</Button>{!confirm && <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : createdId ? "Coba Lagi" : "Simpan Karyawan"}</Button>}</FormActions>
  </form>;
}
