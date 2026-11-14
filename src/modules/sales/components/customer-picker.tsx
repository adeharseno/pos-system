"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CustomerSummary } from "@/modules/customers/customer-input";

type CustomerListResponse = {
  ok?: boolean;
  data?: { rows?: CustomerSummary[]; total?: number };
  error?: { message?: string };
};

type CustomerCreateResponse = {
  ok?: boolean;
  data?: CustomerSummary;
  error?: { code?: string; message?: string };
};

export function CustomerPicker({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: CustomerSummary | null;
  onSelect: (customer: CustomerSummary | null) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const listboxId = useId();
  const nameId = useId();
  const phoneId = useId();
  const addressId = useId();
  const notesId = useId();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const seqRef = useRef(0);
  const pendingRequestIdRef = useRef<string | null>(null);

  const loadCustomers = useCallback(async (searchText: string) => {
    const seq = ++seqRef.current;
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch(`/api/customers?q=${encodeURIComponent(searchText.trim())}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as CustomerListResponse;
      if (seq !== seqRef.current) return;
      if (!response.ok || !payload.ok || !Array.isArray(payload.data?.rows)) {
        setRows([]);
        setFetchError(payload.error?.message ?? "Gagal memuat daftar pelanggan.");
        return;
      }
      setRows(payload.data.rows);
      setActiveIndex(payload.data.rows.length > 0 ? 0 : -1);
    } catch {
      if (seq !== seqRef.current) return;
      setRows([]);
      setFetchError("Koneksi bermasalah saat memuat pelanggan.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || selected || creating) return;
    const timer = window.setTimeout(() => {
      void loadCustomers(query);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [creating, loadCustomers, open, query, selected]);

  function openCreateForm() {
    setCreating(true);
    setOpen(false);
    setCreateError(null);
    pendingRequestIdRef.current = null;
    if (query.trim() && !name.trim()) {
      setName(query.trim());
    }
  }

  function closeCreateForm() {
    if (saving) return;
    setCreating(false);
    setCreateError(null);
    pendingRequestIdRef.current = null;
  }

  function selectCustomer(customer: CustomerSummary) {
    onSelect(customer);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  async function saveNewCustomer() {
    if (saving || disabled) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setCreateError("Nama pelanggan wajib diisi.");
      return;
    }

    pendingRequestIdRef.current ??= crypto.randomUUID();
    setSaving(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request_id: pendingRequestIdRef.current,
          name: trimmedName,
          phone: phone.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const payload = (await response.json()) as CustomerCreateResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        if (response.status >= 400 && response.status < 500) {
          pendingRequestIdRef.current = null;
        }
        setCreateError(payload.error?.message ?? "Pelanggan belum dapat disimpan.");
        return;
      }

      onSelect(payload.data);
      setCreating(false);
      setName("");
      setPhone("");
      setAddress("");
      setNotes("");
      setQuery("");
      pendingRequestIdRef.current = null;
    } catch {
      setCreateError("Gagal menghubungi server. Tekan Simpan Customer untuk mencoba ulang dengan aman.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-semibold" htmlFor={inputId}>
          Pembeli (Master Customer) <span className="text-[var(--danger)]">*</span>
        </label>
        {!creating && !disabled ? (
          <button
            type="button"
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
            onClick={openCreateForm}
          >
            + Tambah Customer Baru
          </button>
        ) : null}
      </div>

      {creating ? (
        <div className="mt-3 space-y-3 rounded-[7px] border border-[var(--border-strong)] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Tambah Customer Baru</p>
            <button
              type="button"
              className="text-xs font-medium text-[var(--text-muted)] hover:text-zinc-900"
              disabled={saving}
              onClick={closeCreateForm}
            >
              Batal
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)]" htmlFor={nameId}>
              Nama Pelanggan <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              id={nameId}
              className="mt-1 min-h-10 w-full rounded-[7px] border border-[var(--border-strong)] bg-white px-3 text-sm"
              disabled={saving}
              placeholder="Contoh: Ibu Sari / Klinik Sehat"
              type="text"
              value={name}
              onChange={(event) => {
                pendingRequestIdRef.current = null;
                setName(event.target.value);
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)]" htmlFor={phoneId}>
              Nomor Telepon / WA (opsional)
            </label>
            <input
              id={phoneId}
              className="mt-1 min-h-10 w-full rounded-[7px] border border-[var(--border-strong)] bg-white px-3 text-sm"
              disabled={saving}
              placeholder="Contoh: 08123456789"
              type="tel"
              value={phone}
              onChange={(event) => {
                pendingRequestIdRef.current = null;
                setPhone(event.target.value);
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)]" htmlFor={addressId}>
              Alamat (opsional)
            </label>
            <input
              id={addressId}
              className="mt-1 min-h-10 w-full rounded-[7px] border border-[var(--border-strong)] bg-white px-3 text-sm"
              disabled={saving}
              placeholder="Alamat pelanggan"
              type="text"
              value={address}
              onChange={(event) => {
                pendingRequestIdRef.current = null;
                setAddress(event.target.value);
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)]" htmlFor={notesId}>
              Catatan (opsional)
            </label>
            <input
              id={notesId}
              className="mt-1 min-h-10 w-full rounded-[7px] border border-[var(--border-strong)] bg-white px-3 text-sm"
              disabled={saving}
              placeholder="Keterangan tambahan"
              type="text"
              value={notes}
              onChange={(event) => {
                pendingRequestIdRef.current = null;
                setNotes(event.target.value);
              }}
            />
          </div>
          {createError ? (
            <p role="alert" className="text-xs font-medium text-[var(--danger)]">
              {createError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="min-h-10 flex-1 rounded-[7px] bg-zinc-950 px-3 text-sm font-semibold text-white disabled:bg-zinc-300"
              disabled={saving || !name.trim()}
              onClick={() => void saveNewCustomer()}
            >
              {saving ? "Menyimpan..." : "Simpan Customer"}
            </button>
            <button
              type="button"
              className="min-h-10 rounded-[7px] border border-[var(--border-strong)] bg-white px-3 text-sm font-medium"
              disabled={saving}
              onClick={closeCreateForm}
            >
              Batal
            </button>
          </div>
        </div>
      ) : selected ? (
        <div className="mt-2 flex items-start justify-between gap-3 rounded-[7px] border border-[var(--accent)] bg-white p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-950">{selected.name}</p>
            {selected.phone ? (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">Telp: {selected.phone}</p>
            ) : null}
            {selected.address ? (
              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{selected.address}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Ganti pelanggan"
            className="shrink-0 rounded-[7px] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-muted)]"
            disabled={disabled}
            onClick={() => {
              onSelect(null);
              setOpen(true);
            }}
          >
            Ganti
          </button>
        </div>
      ) : (
        <div className="relative mt-2">
          <input
            id={inputId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={open}
            className="min-h-11 w-full rounded-[7px] border border-[var(--border-strong)] bg-white px-3 text-sm"
            disabled={disabled}
            placeholder="Cari nama, no. HP, atau alamat..."
            role="combobox"
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                setOpen(true);
                return;
              }
              if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
                return;
              }
              if (event.key === "ArrowDown" && rows.length > 0) {
                event.preventDefault();
                setActiveIndex((prev) => (prev + 1) % rows.length);
              } else if (event.key === "ArrowUp" && rows.length > 0) {
                event.preventDefault();
                setActiveIndex((prev) => (prev <= 0 ? rows.length - 1 : prev - 1));
              } else if (event.key === "Enter" && open && activeIndex >= 0 && rows[activeIndex]) {
                event.preventDefault();
                selectCustomer(rows[activeIndex]);
              }
            }}
          />
          {open ? (
            <div
              id={listboxId}
              role="listbox"
              className="mt-1 max-h-48 overflow-y-auto rounded-[7px] border border-[var(--border-strong)] bg-white shadow-md"
            >
              {loading ? (
                <p className="px-3 py-2.5 text-xs text-[var(--text-muted)]">Mencari pelanggan...</p>
              ) : fetchError ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs text-[var(--danger)]">
                  <span>{fetchError}</span>
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => void loadCustomers(query)}
                  >
                    Muat ulang
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <div className="space-y-2 px-3 py-2.5 text-xs text-[var(--text-muted)]">
                  <p>Pelanggan belum ditemukan.</p>
                  <button
                    type="button"
                    className="font-semibold text-[var(--accent)] hover:underline"
                    onClick={openCreateForm}
                  >
                    + Tambah &quot;{query.trim() || "Customer Baru"}&quot;
                  </button>
                </div>
              ) : (
                rows.map((customer, index) => (
                  <button
                    key={customer.id}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm ${
                      activeIndex === index ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-muted)]"
                    }`}
                    onClick={() => selectCustomer(customer)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-zinc-950">{customer.name}</span>
                      {customer.phone || customer.address ? (
                        <span className="block truncate text-xs text-[var(--text-muted)]">
                          {[customer.phone, customer.address].filter(Boolean).join(" • ")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

