export type LegacySupplierRecord = {
  rowNumber: number;
  legacyCode: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};

export type SupplierImportValues = {
  legacy_code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
};

export type ExistingSupplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
};

export type SupplierImportWrite =
  | { kind: "insert"; rowNumber: number; values: SupplierImportValues & { is_active: boolean } }
  | { kind: "update"; rowNumber: number; id: string; values: SupplierImportValues };

export type SupplierImportStore = {
  existingByLegacyCode: () => Promise<Map<string, ExistingSupplier>>;
  /** Must apply every write in one transaction and roll back on the first failure. */
  apply: (writes: SupplierImportWrite[]) => Promise<void>;
};

export type SupplierImportSummary = {
  read: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skippedEmpty: number;
  inactive: number;
  duplicateNames: Array<{ name: string; count: number }>;
};

const INTERNAL_SUPPLIERS = new Set(["LARUTAN", "GUDANG"]);
const LEGACY_COLUMNS = ["Kode", "Nama Supplier", "Alamat 1", "Alamat 2", "Kota", "Telp", "Kontak 1"] as const;

/** Minimal RFC 4180 parser: BOM, quoted commas, escaped quotes, and CRLF. */
export function parseCsv(text: string): string[][] {
  const value = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && value[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

/**
 * Maps only the supplier columns required by the legacy import. Debt and
 * balance columns are intentionally ignored. Codes stay text so leading zeros
 * are never lost.
 */
export function mapLegacySupplierRows(csv: string): {
  records: LegacySupplierRecord[];
  read: number;
  skippedEmpty: number;
} {
  const [headerRow, ...dataRows] = parseCsv(csv);
  if (!headerRow) return { records: [], read: 0, skippedEmpty: 0 };
  const headers = headerRow.map((header) => header.trim());
  for (const required of LEGACY_COLUMNS) {
    if (!headers.includes(required)) throw new Error(`Kolom ${required} tidak ditemukan pada CSV pemasok.`);
  }
  const cell = (row: string[], name: (typeof LEGACY_COLUMNS)[number]) => (row[headers.indexOf(name)] ?? "").trim();
  const records: LegacySupplierRecord[] = [];
  let skippedEmpty = 0;

  for (const [index, row] of dataRows.entries()) {
    const rowNumber = index + 2;
    const name = cell(row, "Nama Supplier");
    if (!name) {
      skippedEmpty += 1;
      continue;
    }
    const legacyCode = cell(row, "Kode");
    if (!legacyCode) throw new Error(`Baris ${rowNumber}: Kode pemasok wajib diisi.`);
    const address = ["Alamat 1", "Alamat 2", "Kota"]
      .map((column) => cell(row, column as (typeof LEGACY_COLUMNS)[number]))
      .filter(Boolean)
      .join(", ") || null;
    records.push({
      rowNumber,
      legacyCode,
      name,
      contactPerson: cell(row, "Kontak 1") || null,
      phone: cell(row, "Telp") || null,
      address,
      isActive: !INTERNAL_SUPPLIERS.has(name.toUpperCase()),
    });
  }
  return { records, read: dataRows.length, skippedEmpty };
}

function duplicateNames(records: LegacySupplierRecord[]) {
  const counts = new Map<string, { name: string; count: number }>();
  for (const record of records) {
    const key = record.name.trim().toLowerCase();
    const current = counts.get(key);
    counts.set(key, { name: current?.name ?? record.name, count: (current?.count ?? 0) + 1 });
  }
  return [...counts.values()].filter((entry) => entry.count > 1);
}

function unchanged(current: ExistingSupplier, values: SupplierImportValues) {
  return (
    current.name === values.name &&
    current.contact_person === values.contact_person &&
    current.phone === values.phone &&
    current.address === values.address
  );
}

/**
 * Compares each legacy row with the stored supplier. Identical managed fields
 * count as unchanged and are not written. A difference refreshes name, contact,
 * phone and address only; is_active is never included in an update, so manual
 * activation changes survive every rerun.
 */
export async function importSupplierRecords(
  records: LegacySupplierRecord[],
  store: SupplierImportStore,
  options: { dryRun?: boolean } = {},
): Promise<Omit<SupplierImportSummary, "read" | "skippedEmpty">> {
  const existing = await store.existingByLegacyCode();
  const writes: SupplierImportWrite[] = [];
  const seenCodes = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let unchangedCount = 0;
  let inactive = 0;

  for (const record of records) {
    if (!record.isActive) inactive += 1;
    if (seenCodes.has(record.legacyCode)) {
      throw new Error(`Baris ${record.rowNumber}: Kode pemasok ${record.legacyCode} duplikat.`);
    }
    seenCodes.add(record.legacyCode);

    const values: SupplierImportValues = {
      legacy_code: record.legacyCode,
      name: record.name,
      contact_person: record.contactPerson,
      phone: record.phone,
      address: record.address,
    };
    const current = existing.get(record.legacyCode);
    if (!current) {
      inserted += 1;
      writes.push({
        kind: "insert",
        rowNumber: record.rowNumber,
        values: { ...values, is_active: record.isActive },
      });
    } else if (unchanged(current, values)) {
      unchangedCount += 1;
    } else {
      updated += 1;
      writes.push({ kind: "update", rowNumber: record.rowNumber, id: current.id, values });
    }
  }

  if (!options.dryRun && writes.length > 0) await store.apply(writes);
  return { inserted, updated, unchanged: unchangedCount, inactive, duplicateNames: duplicateNames(records) };
}

export async function importSupplierCsv(
  csv: string,
  store: SupplierImportStore,
  options: { dryRun?: boolean } = {},
): Promise<SupplierImportSummary> {
  const { records, read, skippedEmpty } = mapLegacySupplierRows(csv);
  const summary = await importSupplierRecords(records, store, options);
  return { ...summary, read, skippedEmpty };
}
