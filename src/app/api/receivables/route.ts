import { parseReceivableListFilters } from "@/modules/receivables/receivables-filters";
import { listReceivablesForOwner } from "@/modules/receivables/application/receivables-service";
import { executeApi } from "@/modules/shared/api/response";

export async function GET(request: Request) {
  return executeApi(async () => {
    const url = new URL(request.url);
    const query: Record<string, string | undefined> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    const filters = parseReceivableListFilters(query);
    return listReceivablesForOwner(filters);
  });
}

