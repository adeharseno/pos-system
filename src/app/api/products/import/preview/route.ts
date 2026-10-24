import { requireRole } from "@/modules/auth/application/auth-service";
import { buildProductImportPreview } from "@/modules/catalog/application/preview-product-import";
import { getProductCreateMasterData } from "@/modules/catalog/data/admin-product-queries";
import { executeApi } from "@/modules/shared/api/response";
import { PosInputError } from "@/modules/shared/validation/input";

const maxUploadBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  return executeApi(async () => {
    await requireRole(["owner_admin"]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new PosInputError("File is required");
    if (file.size > maxUploadBytes) throw new PosInputError("File is too large");

    try {
      const master = await getProductCreateMasterData();
      return { rows: buildProductImportPreview(await file.arrayBuffer(), file.name, master) };
    } catch (error) {
      if (error instanceof PosInputError) throw error;
      throw new PosInputError("File could not be parsed");
    }
  });
}
