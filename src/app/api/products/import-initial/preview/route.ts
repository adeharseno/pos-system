import { requireRole } from "@/modules/auth/application/auth-service";
import { buildInitialProductImportPreview } from "@/modules/catalog/application/initial-product-import";
import { getProductCreateMasterData, isProductCatalogEmpty } from "@/modules/catalog/data/admin-product-queries";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError } from "@/modules/shared/validation/input";

export async function POST(request: Request) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    if (!(await isProductCatalogEmpty())) throw new PosInputError("Impor data awal hanya dapat dilakukan ketika Master Barang kosong.");
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new PosInputError("Pilih file .xlsx maksimal 5 MB.");
    try { return buildInitialProductImportPreview(await file.arrayBuffer(), file.name, await getProductCreateMasterData()); }
    catch (error) { throw new PosInputError(error instanceof Error ? error.message : "File tidak dapat dibaca."); }
  });
}
