import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError, PosDomainError } from "@/modules/shared/errors/pos-domain-error";

function duplicate(error: { message?: string }) {
  const message = String(error.message);
  if (message.includes("uq_tax_rates_normalized_name")) return new PosDomainError("DUPLICATE_TAX_NAME");
  if (message.includes("uq_active_tax_rates_rate")) return new PosDomainError("DUPLICATE_TAX_RATE");
  return null;
}

export async function listTaxRates(activeOnly = false) {
  let query = createAdminSupabaseClient().from("tax_rates").select("id,name,rate,is_active").order("rate").order("name");
  if (activeOnly) query = query.eq("is_active", true);
  const result = await query;
  if (result.error) throw mapDatabaseError(result.error);
  return result.data ?? [];
}

export async function createTaxRate(name: string, rate: number) {
  const result = await createAdminSupabaseClient().from("tax_rates").insert({ name, rate }).select("id,name,rate,is_active").single();
  if (result.error) throw duplicate(result.error) ?? mapDatabaseError(result.error);
  return result.data;
}

export async function updateTaxRate(id: string, values: { name?: string; rate?: number; is_active?: boolean }) {
  const result = await createAdminSupabaseClient().from("tax_rates").update(values).eq("id", id).select("id,name,rate,is_active").maybeSingle();
  if (result.error) throw duplicate(result.error) ?? mapDatabaseError(result.error);
  if (!result.data) throw new PosDomainError("TAX_NOT_FOUND");
  return result.data;
}
