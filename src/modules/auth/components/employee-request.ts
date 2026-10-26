import { EMPLOYEE_ERRORS } from "../employee-errors";

export class EmployeeUiError extends Error {}
export async function employeeRequest<T = unknown>(url: string, method = "GET", body?: object, signal?: AbortSignal): Promise<T> {
  try {
    const response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", signal,
      headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      const code = result.error?.code;
      const message = typeof code === "string" && Object.hasOwn(EMPLOYEE_ERRORS, code)
        ? EMPLOYEE_ERRORS[code as keyof typeof EMPLOYEE_ERRORS][1]
        : response.status === 401 ? "Sesi Anda berakhir. Silakan masuk kembali."
        : response.status === 403 ? "Anda tidak memiliki akses. Masuk kembali atau hubungi pemilik."
        : "Permintaan belum berhasil. Periksa isian Anda lalu coba kembali.";
      throw new EmployeeUiError(message);
    }
    return result.data as T;
  } catch (error) {
    if (error instanceof EmployeeUiError || error instanceof DOMException && error.name === "AbortError") throw error;
    throw new EmployeeUiError("Tidak dapat terhubung. Periksa koneksi lalu coba kembali.");
  }
}
export function uiError(error: unknown) {
  return error instanceof EmployeeUiError ? error.message : "Data belum dapat diproses. Silakan coba kembali.";
}
