import "server-only";
import { cache } from "react";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { mapDatabaseError } from "@/modules/shared/errors/pos-domain-error";
import { jakartaToday } from "@/modules/reports/sales-report";
import { parsePurchaseDueReminders } from "./due-reminder-model";

export const getPurchaseDueReminders = cache(async () => {
  const { data, error } = await createAdminSupabaseClient().rpc("purchase_invoice_due_reminders", { p_today: jakartaToday() });
  if (error) throw mapDatabaseError(error);
  return parsePurchaseDueReminders(data);
});
