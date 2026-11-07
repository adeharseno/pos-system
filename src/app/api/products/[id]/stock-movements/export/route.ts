import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireAllPermissions } from "@/modules/auth/application/auth-service";
import { listProductStockMovements } from "@/modules/inventory/data/stock-movement-read-model";
import { collectStockMovementExport, buildStockMovementWorkbook, StockMovementExportError, stockMovementExportFilename } from "@/modules/inventory/stock-movement-export";
import { parseStockMovementFilters } from "@/modules/inventory/stock-movement-filters";
import { mapApiError } from "@/modules/shared/api/response";
import { mapDatabaseError, PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import { requireUuid } from "@/modules/shared/validation/input";

const jakartaDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAllPermissions(["inventory.view", "transactions.view"]);
    const productId = requireUuid((await context.params).id, "productId");
    const url = new URL(request.url);
    const filters = parseStockMovementFilters({
      movementType: url.searchParams.get("movementType") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
    });
    const productResult = await createAdminSupabaseClient().from("products").select("name,sku").eq("id", productId).maybeSingle();
    if (productResult.error) throw mapDatabaseError(productResult.error);
    if (!productResult.data) throw new PosDomainError("PRODUCT_NOT_FOUND");
    const rows = await collectStockMovementExport((page, limit) => listProductStockMovements(productId, page, limit, filters));
    const workbook = buildStockMovementWorkbook(rows, productResult.data);
    const filename = stockMovementExportFilename(productResult.data.sku, jakartaDate());
    return new Response(new Uint8Array(workbook), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof StockMovementExportError) {
      const detail = error.code === "EMPTY"
        ? ["EXPORT_EMPTY", "Tidak ada riwayat sesuai filter untuk diekspor.", 422] as const
        : error.code === "LIMIT"
          ? ["EXPORT_LIMIT", "Jumlah riwayat terlalu banyak untuk diekspor. Persempit filter tanggal.", 413] as const
          : ["EXPORT_CHANGED", "Riwayat berubah saat export diproses. Silakan coba lagi.", 409] as const;
      return Response.json({ ok: false, error: { code: detail[0], message: detail[1] } }, { status: detail[2] });
    }
    return mapApiError(error);
  }
}
