import { executeApi } from "@/modules/shared/api/response";

/** Employee/account responses must never be cached, including errors and token acceptance. */
export async function executeEmployeeApi<T>(operation: () => Promise<T>, status = 200) {
  const response = await executeApi(operation, status);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
