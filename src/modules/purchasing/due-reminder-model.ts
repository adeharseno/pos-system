export type PurchaseDueReminder = { id: string; invoiceNumber: string; supplier: string; dueDate: string; outstanding: number; daysRemaining: number };

export function parsePurchaseDueReminders(value: unknown): PurchaseDueReminder[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid due reminders");
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("Invalid due reminder");
    const row = item as Record<string, unknown>;
    if (![row.id,row.invoiceNumber,row.supplier,row.dueDate].every(value => typeof value === "string")
      || typeof row.outstanding !== "number" || row.outstanding <= 0 || !Number.isInteger(row.daysRemaining)) throw new TypeError("Invalid due reminder");
    return row as PurchaseDueReminder;
  });
}

export const dueReminderLabel = (days: number) => days < 0 ? `Terlambat ${Math.abs(days)} hari` : days === 0 ? "Jatuh tempo hari ini" : `${days} hari lagi`;
