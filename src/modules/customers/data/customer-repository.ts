import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { callCoreRpc } from "@/modules/shared/data/core-rpc";
import { requireResultObject, resultString } from "@/modules/shared/data/result";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import type { CustomerInput, CustomerSummary } from "../customer-input";

export async function listCustomers(q = "", page = 1) {
  const safePage = Math.max(1, Math.min(10000, Math.floor(page)));
  const normalized = q.trim().slice(0, 200);
  let query = createAdminSupabaseClient()
    .from("customers")
    .select("id,name,phone,address,notes", { count: "exact" })
    .eq("is_active", true)
    .order("name")
    .order("id");

  if (normalized) {
    const escaped = normalized.replace(/[%_\\]/g, "\\$&").replace(/,/g, "");
    if (escaped) {
      query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
    }
  }

  const result = await query.range((safePage - 1) * 20, safePage * 20 - 1);
  if (result.error) throw mapDatabaseError(result.error);
  return {
    rows: (result.data ?? []) as CustomerSummary[],
    total: result.count ?? 0,
  };
}

export async function createCustomer(
  input: CustomerInput,
  employeeId: string,
  requestId: string,
): Promise<CustomerSummary> {
  const data = requireResultObject(
    await callCoreRpc("create_customer_idempotent", {
      p_request_id: requestId,
      p_employee_id: employeeId,
      p_name: input.name,
      p_phone: input.phone ?? undefined,
      p_address: input.address ?? undefined,
      p_notes: input.notes ?? undefined,
    }),
  );

  return {
    id: resultString(data, "id"),
    name: resultString(data, "name"),
    phone: typeof data.phone === "string" ? data.phone : null,
    address: typeof data.address === "string" ? data.address : null,
    notes: typeof data.notes === "string" ? data.notes : null,
  };
}

