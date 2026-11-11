import { getReceivableDetailForOwner } from "@/modules/receivables/application/receivables-service";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return executeApi(async () => {
    const { id } = await params;
    return getReceivableDetailForOwner(id);
  });
}

