import { requireRole } from "@/modules/auth/application/auth-service";
import { executeApi } from "@/modules/shared/api/response";
import { fulfillSusulanItem } from "@/modules/sales/data/bpjs-susulan-queries";

/**
 * POST /api/transactions/[id]/susulan/[susulanId]/fulfill
 * Marks a susulan item as completed. Only owner_admin may call.
 * Optional JSON body: { product_id?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; susulanId: string }> }
) {
  return executeApi(async () => {
    const employee = await requireRole(["owner_admin"]);
    const { susulanId } = await params;

    let productId: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.product_id === "string" && body.product_id.trim()) {
        productId = body.product_id.trim();
      }
    } catch {
      // Body is optional
    }

    await fulfillSusulanItem(susulanId, employee.employeeId, productId);
    return { fulfilled: true };
  });
}
