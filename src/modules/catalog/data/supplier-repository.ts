import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError, PosDomainError } from "@/modules/shared/errors/pos-domain-error";
import type { SupplierInput } from "../supplier-input";
export async function listSuppliers(q = "", page = 1) {
  let query = createAdminSupabaseClient().from("suppliers").select("id,name,phone,address", { count: "exact" }).eq("is_active", true).order("name").order("id");
  if (q) query = query.ilike("name", "%" + q.replace(/[%_\\]/g, "\\$&") + "%");
  const result = await query.range((page - 1) * 20, page * 20 - 1);
  if (result.error) throw mapDatabaseError(result.error);
  return { rows: result.data ?? [], total: result.count ?? 0 };
}
export async function saveSupplier(input: SupplierInput, id?: string) {
  const table = createAdminSupabaseClient().from("suppliers");
  const result = id
    ? await table.update(input).eq("id", id).eq("is_active", true).select("id,name,phone,address").maybeSingle()
    : await table.insert(input).select("id,name,phone,address").single();
  if (result.error) throw mapDatabaseError(result.error);
  if (!result.data) throw new PosDomainError("SUPPLIER_NOT_FOUND");
  return result.data;
}
// Always retain the row and every historical reference, including future transaction references.
export async function removeSupplier(id: string) {
  const result = await createAdminSupabaseClient().from("suppliers").update({ is_active: false }).eq("id", id).eq("is_active", true).select("id").maybeSingle();
  if (result.error) throw mapDatabaseError(result.error);
  if (!result.data) throw new PosDomainError("SUPPLIER_NOT_FOUND");
  return result.data;
}
