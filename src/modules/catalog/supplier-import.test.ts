import assert from "node:assert/strict";
import test from "node:test";

import {
  importSupplierCsv,
  mapLegacySupplierRows,
  type ExistingSupplier,
  type SupplierImportStore,
  type SupplierImportValues,
} from "./supplier-import";

const header = "Kode,Nama Supplier,Alamat 1,Alamat 2,Kota,Telp,Kontak 1,Hutang";
const csv = "\uFEFF" + [
  header,
  '0005, PT Sehat ,"Jl. A, No. 1",,Jakarta,021-1,Budi,999999',
  "0010,LARUTAN,,,,,,",
  "0020,gudang,Gudang 1,,Bandung,022,Ani,0",
  "0030,,Jalan,,, ,,",
  "0040,PT Sehat,Jl B,,Bogor,,,",
].join("\r\n") + "\r\n";

type Stored = { id: string; values: SupplierImportValues; is_active: boolean };
type MemoryStore = SupplierImportStore & {
  rows: Map<string, Stored>;
  applyCalls: () => number;
  setActive: (code: string, active: boolean) => void;
};

function memoryStore(): MemoryStore {
  const state = { rows: new Map<string, Stored>(), applyCalls: 0, nextId: 1 };
  return {
    get rows() {
      return state.rows;
    },
    applyCalls: () => state.applyCalls,
    setActive(code, active) {
      const row = state.rows.get(code);
      if (!row) throw new Error(`missing ${code}`);
      row.is_active = active;
    },
    async existingByLegacyCode() {
      return new Map(
        [...state.rows].map(([code, row]) => [
          code,
          {
            id: row.id,
            name: row.values.name,
            contact_person: row.values.contact_person,
            phone: row.values.phone,
            address: row.values.address,
            is_active: row.is_active,
          } satisfies ExistingSupplier,
        ]),
      );
    },
    async apply(writes) {
      state.applyCalls += 1;
      const next = new Map(
        [...state.rows].map(([code, row]) => [code, { ...row, values: { ...row.values } }]),
      );
      for (const write of writes) {
        if (write.kind === "insert") {
          next.set(write.values.legacy_code, {
            id: String(state.nextId++),
            values: {
              legacy_code: write.values.legacy_code,
              name: write.values.name,
              contact_person: write.values.contact_person,
              phone: write.values.phone,
              address: write.values.address,
            },
            is_active: write.values.is_active,
          });
        } else {
          const entry = [...next.values()].find((row) => row.id === write.id);
          if (!entry) throw new Error(`missing id ${write.id}`);
          entry.values = { ...write.values };
        }
      }
      state.rows = next;
    },
  };
}

test("BOM is stripped, leading zeros stay text, and addresses skip empty parts", () => {
  const { records, read, skippedEmpty } = mapLegacySupplierRows(csv);
  assert.equal(read, 5);
  assert.equal(skippedEmpty, 1);
  assert.equal(records.length, 4);
  assert.equal(records[0].legacyCode, "0005");
  assert.equal(records[0].name, "PT Sehat");
  assert.equal(records[0].address, "Jl. A, No. 1, Jakarta");
  assert.equal(records[0].contactPerson, "Budi");
  assert.equal(records[0].phone, "021-1");
  assert.equal(records[2].address, "Gudang 1, Bandung");
  assert.equal(records[3].address, "Jl B, Bogor");
  assert.equal(records[1].address, null);
});

test("empty-name rows are skipped and duplicate names are reported", async () => {
  const { records, skippedEmpty } = mapLegacySupplierRows(csv);
  assert.equal(skippedEmpty, 1);
  assert.equal(records.some((record) => record.name === ""), false);
  const summary = await importSupplierCsv(csv, memoryStore());
  assert.deepEqual(summary.duplicateNames, [{ name: "PT Sehat", count: 2 }]);
});

test("LARUTAN and GUDANG are inserted inactive, case-insensitively", async () => {
  const store = memoryStore();
  const summary = await importSupplierCsv(csv, store);
  assert.equal(summary.inactive, 2);
  assert.equal(store.rows.get("0010")?.is_active, false);
  assert.equal(store.rows.get("0020")?.is_active, false);
  assert.equal(store.rows.get("0005")?.is_active, true);
});

test("import is idempotent: a second run inserts and writes nothing", async () => {
  const store = memoryStore();
  const first = await importSupplierCsv(csv, store);
  assert.equal(first.inserted, 4);
  assert.equal(first.updated, 0);
  assert.equal(first.unchanged, 0);
  assert.equal(first.read, 5);
  assert.equal(first.skippedEmpty, 1);
  assert.equal(store.rows.size, 4);

  const second = await importSupplierCsv(csv, store);
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 4);
  assert.equal(store.rows.size, 4);
  assert.equal(store.applyCalls(), 1);
});

test("manual is_active changes survive a rerun", async () => {
  const store = memoryStore();
  await importSupplierCsv(csv, store);
  store.setActive("0010", true);
  await importSupplierCsv(csv, store);
  assert.equal(store.rows.get("0010")?.is_active, true);
  assert.equal(store.rows.get("0020")?.is_active, false);
});

test("a changed source row refreshes managed fields without touching is_active", async () => {
  const store = memoryStore();
  await importSupplierCsv(csv, store);
  store.setActive("0005", false);
  const renamed = csv.replace("0005, PT Sehat ,", "0005, PT Sehat Baru ,");
  const summary = await importSupplierCsv(renamed, store);
  assert.equal(summary.inserted, 0);
  assert.equal(summary.updated, 1);
  assert.equal(summary.unchanged, 3);
  assert.equal(store.rows.get("0005")?.values.name, "PT Sehat Baru");
  assert.equal(store.rows.get("0005")?.is_active, false);
});

test("dry-run reports the same changes without calling the writer", async () => {
  const store = memoryStore();
  const summary = await importSupplierCsv(csv, store, { dryRun: true });
  assert.equal(summary.inserted, 4);
  assert.equal(summary.updated, 0);
  assert.equal(summary.unchanged, 0);
  assert.equal(summary.skippedEmpty, 1);
  assert.equal(store.applyCalls(), 0);
  assert.equal(store.rows.size, 0);
});
