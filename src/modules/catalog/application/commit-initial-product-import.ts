import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { PosInputError } from "@/modules/shared/validation/input";
import { buildInitialProductImportPreview, initialImportRpcRows, validateInitialImportConfirmation } from "./initial-product-import";
import { getProductCreateMasterData } from "../data/admin-product-queries";

export async function commitInitialProductImport(bytes: ArrayBuffer, fileName: string, requestId: string, employeeId: string, warningsAcknowledged: boolean) {
  const master = await getProductCreateMasterData();
  let preview: ReturnType<typeof buildInitialProductImportPreview>;
  try {
    preview = buildInitialProductImportPreview(bytes, fileName, master);
  } catch (error) {
    throw new PosInputError(error instanceof Error ? error.message : "File tidak dapat dibaca.");
  }
  try { validateInitialImportConfirmation(preview, warningsAcknowledged); }
  catch (error) { throw new PosInputError(error instanceof Error ? error.message : "Konfirmasi impor tidak valid."); }
  const client = createAdminSupabaseClient();
  const { data, error } = await client.rpc("import_initial_products", {
    p_request_id: requestId,
    p_employee_id: employeeId,
    p_rows: initialImportRpcRows(preview.rows),
  });
  if (error) throw mapDatabaseError(error);
  return data;
}
