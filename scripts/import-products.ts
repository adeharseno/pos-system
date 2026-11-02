import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import * as XLSX from "xlsx";

import {
  applyProductImportPlan,
  buildProductImportPlan,
  mapLegacyProductRows,
  parseProductImportMapping,
  ProductImportBlockedError,
  type ExistingProduct,
  type ProductImportIssue,
  type ProductImportLookups,
  type ProductImportStore,
  type ProductImportSummary,
  type ProductImportWrite,
} from "../src/modules/catalog/product-import";

const DEFAULT_FILE = "data/legacy/produk_final.xlsx";
const MAPPING_FILE = "scripts/import-products.mapping.json";
const REPORT_FILE = "data/legacy/import-products-report.csv";
const PAGE_SIZE = 1000;

function rowMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function databaseUrl(supabaseUrl: string) {
  const explicit = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (explicit) return explicit;
  const parsed = new URL(supabaseUrl);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("SUPABASE_DB_URL wajib diisi untuk database non-lokal.");
  }
  return `postgresql://postgres:postgres@${parsed.hostname}:54322/postgres`;
}

function readWorkbookRows(file: string) {
  const workbook = XLSX.readFile(file, { cellText: true, cellDates: false });
  const sheet = workbook.Sheets["Produk"];
  if (!sheet) throw new Error(`Sheet "Produk" tidak ditemukan pada ${file}.`);
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
}

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    from += PAGE_SIZE;
  }
}

async function loadLookups(supabase: SupabaseClient): Promise<ProductImportLookups> {
  const [subcategories, suppliers, products] = await Promise.all([
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("subcategories").select("id,name").order("id").range(from, to),
    ),
    fetchAll<{ id: string; name: string; is_active: boolean }>((from, to) =>
      supabase.from("suppliers").select("id,name,is_active").order("id").range(from, to),
    ),
    fetchAll<ExistingProduct>((from, to) =>
      supabase
        .from("products")
        .select("id,sku,name,subcategory_id,default_supplier_id")
        .order("id")
        .range(from, to),
    ),
  ]);
  return { subcategories, suppliers, products };
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeReport(file: string, issues: ProductImportIssue[]) {
  const lines = [
    "row_no,name,issue",
    ...issues.map((issue) => [issue.rowNumber, issue.name, issue.issue].map(csvCell).join(",")),
  ];
  await writeFile(file, `${lines.join("\r\n")}\r\n`, "utf8");
}

function formatUnmapped(values: Array<{ value: string; count: number }>) {
  return values.length
    ? values.map((entry) => `${entry.value} (${entry.count})`).join(", ")
    : "-";
}

function formatInferred(counts: Record<string, number>) {
  const entries = Object.entries(counts).sort(
    ([leftUnit, leftCount], [rightUnit, rightCount]) =>
      rightCount - leftCount || leftUnit.localeCompare(rightUnit),
  );
  return entries.length
    ? ` (${entries.map(([unit, count]) => `${unit}=${count}`).join(", ")})`
    : "";
}

function printSummary(file: string, dryRun: boolean, summary: ProductImportSummary) {
  console.log(`File: ${file}${dryRun ? " (dry run)" : ""}`);
  console.log(`Read: ${summary.read}`);
  console.log(`Inserted: ${summary.inserted}`);
  console.log(`Updated: ${summary.updated}`);
  console.log(`Unchanged: ${summary.unchanged}`);
  console.log(`Skipped empty name: ${summary.skippedEmpty}`);
  console.log(`Skipped duplicate: ${summary.skippedDuplicate}`);
  console.log(`Unmapped subcategory: ${formatUnmapped(summary.unmappedSubcategories)}`);
  console.log(`Unmapped classification: ${formatUnmapped(summary.unmappedClassifications)}`);
  console.log(`Generated SKUs: ${summary.generatedSkus}`);
  console.log(`Inferred units: ${summary.inferredUnits}${formatInferred(summary.inferredUnitCounts)}`);
  console.log(`Zero price: ${summary.zeroPrice}`);
  console.log(`Supplier none: ${summary.supplierNone}`);
  console.log(`Supplier ambiguous: ${summary.supplierAmbiguous}`);
}

// PostgREST requests cannot share a transaction, so every write goes through
// one direct Postgres transaction. Reads still use the service-role client.
async function applyWrites(connectionString: string, writes: ProductImportWrite[]) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    for (const write of writes) {
      try {
        if (write.kind === "insert") {
          const value = write.value;
          const result = await client.query<{ id: string }>(
            `insert into public.products
               (sku,name,category_id,subcategory_id,drug_classification,base_unit,minimum_stock,default_supplier_id,is_active)
             values ($1,$2,null,$3,$4,$5,$6,$7,true)
             returning id`,
            [
              value.sku,
              value.name,
              value.subcategory_id,
              value.drug_classification,
              value.base_unit,
              value.minimum_stock,
              value.default_supplier_id,
            ],
          );
          const productId = result.rows[0]?.id;
          if (!productId) throw new Error("Insert produk tidak mengembalikan id.");
          if (value.selling_price !== null) {
            await client.query(
              `insert into public.product_units
                 (product_id,unit_name,conversion_to_base,selling_price,is_base_unit)
               values ($1,$2,1,$3,true)`,
              [productId, value.base_unit, value.selling_price],
            );
          }
        } else {
          await client.query(
            `update public.products
             set subcategory_id = coalesce(subcategory_id, $2),
                 default_supplier_id = coalesce(default_supplier_id, $3),
                 updated_at = now()
             where id = $1`,
            [write.value.id, write.value.subcategory_id, write.value.default_supplier_id],
          );
        }
      } catch (error) {
        throw new Error(
          `Baris ${write.value.rowNumber} (${write.value.name}) gagal: ${rowMessage(error)}`,
        );
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
  const allowUnmapped = args.includes("--allow-unmapped");
  const positional = args.filter((argument) => !argument.startsWith("--"));
  const file = resolve(positional[0] ?? DEFAULT_FILE);
  const mappingFile = resolve(MAPPING_FILE);
  const reportFile = resolve(REPORT_FILE);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.");
  }

  const parsed = mapLegacyProductRows(readWorkbookRows(file));
  const mapping = parseProductImportMapping(
    JSON.parse(await readFile(mappingFile, "utf8")) as unknown,
  );
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const store: ProductImportStore = {
    loadLookups: () => loadLookups(supabase),
    apply: (writes) => applyWrites(databaseUrl(supabaseUrl), writes),
  };

  const plan = buildProductImportPlan(parsed, mapping, await store.loadLookups());
  await writeReport(reportFile, plan.issues);

  if (!dryRun) {
    try {
      await applyProductImportPlan(plan, store, { allowUnmapped });
    } catch (error) {
      if (error instanceof ProductImportBlockedError) {
        printSummary(file, dryRun, plan.summary);
      }
      throw error;
    }
  }

  printSummary(file, dryRun, plan.summary);
  console.log(`Report: ${reportFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(rowMessage(error));
    process.exitCode = 1;
  });
}
