import type { ProductImportCommitResult, ProductImportCommitRow } from "./application/product-import-commit";

export const IMPORT_BATCH_SIZE = 50;

// The same commit endpoint is called in bounded requests. No automatic retry on
// an uncertain network result; a user retry is checked against existing SKUs.
export async function submitProductImportBatches(
  rows: ProductImportCommitRow[],
  submit: (batch: ProductImportCommitRow[]) => Promise<ProductImportCommitResult[]>,
  onProgress: (results: ProductImportCommitResult[], completed: number) => void,
) {
  const results: ProductImportCommitResult[] = [];
  for (let offset = 0; offset < rows.length; offset += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + IMPORT_BATCH_SIZE);
    const received = await submit(batch);
    if (received.length !== batch.length || received.some(result => result.status !== "success" && result.status !== "failed") || batch.some(row => received.filter(result => result.row === row.rowNumber && result.sku === row.sku).length !== 1)) throw new Error("Hasil batch belum lengkap. Periksa hasil sebelum melanjutkan.");
    results.push(...received);
    onProgress([...results], Math.min(offset + batch.length, rows.length));
  }
  return results;
}
