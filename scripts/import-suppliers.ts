import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

import {
  importSupplierCsv,
  type ExistingSupplier,
  type SupplierImportStore,
  type SupplierImportWrite,
  type SupplierImportValues,
} from "../src/modules/catalog/supplier-import";

function databaseUrl(supabaseUrl: string) {
  const explicit = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (explicit) return explicit;
  const parsed = new URL(supabaseUrl);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("SUPABASE_DB_URL wajib diisi untuk database non-lokal.");
  }
  return `postgresql://postgres:postgres@${parsed.hostname}:54322/postgres`;
}

function rowMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// PostgREST requests cannot share a transaction, so all writes go through one
// direct Postgres transaction; reads still use the service-role client above.
async function applyWrites(connectionString: string, writes: SupplierImportWrite[]) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    for (const write of writes) {
      try {
        if (write.kind === "insert") {
          const values: SupplierImportValues & { is_active: boolean } = write.values;
          await client.query(
            `insert into public.suppliers (legacy_code,name,contact_person,phone,address,is_active)
             values ($1,$2,$3,$4,$5,$6)`,
            [values.legacy_code, values.name, values.contact_person, values.phone, values.address, values.is_active],
          );
        } else {
          await client.query(
            `update public.suppliers
             set name=$2,contact_person=$3,phone=$4,address=$5,updated_at=now()
             where id=$1`,
            [write.id, write.values.name, write.values.contact_person, write.values.phone, write.values.address],
          );
        }
      } catch (error) {
        throw new Error(`Baris ${write.rowNumber} (${write.values.legacy_code}) gagal: ${rowMessage(error)}`);
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = resolve(args.find((argument) => !argument.startsWith("--")) ?? "data/legacy/supplier.csv");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const store: SupplierImportStore = {
    async existingByLegacyCode() {
      const result = await supabase
        .from("suppliers")
        .select("id,legacy_code,name,contact_person,phone,address,is_active")
        .not("legacy_code", "is", null);
      if (result.error) throw new Error(result.error.message);
      return new Map(
        (result.data ?? [])
          .filter((row): row is typeof row & { id: string; legacy_code: string } => Boolean(row.id && row.legacy_code))
          .map((row) => [
            row.legacy_code,
            {
              id: row.id,
              name: row.name,
              contact_person: row.contact_person,
              phone: row.phone,
              address: row.address,
              is_active: row.is_active,
            } satisfies ExistingSupplier,
          ]),
      );
    },
    async apply(writes) {
      await applyWrites(databaseUrl(supabaseUrl), writes);
    },
  };

  const summary = await importSupplierCsv(await readFile(file, "utf8"), store, { dryRun });
  console.log(`File: ${file}${dryRun ? " (dry run)" : ""}`);
  console.log(`Read: ${summary.read}`);
  console.log(`Inserted: ${summary.inserted}`);
  console.log(`Updated: ${summary.updated}`);
  console.log(`Unchanged: ${summary.unchanged}`);
  console.log(`Skipped empty name: ${summary.skippedEmpty}`);
  console.log(`Inactive: ${summary.inactive}`);
  console.log(
    `Duplicate names: ${summary.duplicateNames.length
      ? summary.duplicateNames.map((entry) => `${entry.name} (${entry.count})`).join(", ")
      : "-"}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(rowMessage(error));
    process.exitCode = 1;
  });
}
