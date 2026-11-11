const indonesianDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

/** Format a YYYY-MM-DD date or ISO timestamp cleanly in Jakarta timezone. */
export function formatIndonesianDate(value: string | null | undefined): string {
  if (!value) return "-";
  const trimmed = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00Z`)
    : new Date(trimmed);
  if (!Number.isFinite(parsed.valueOf())) return trimmed;
  return indonesianDateFormatter.format(parsed);
}

/** Add a whole number of calendar days to a YYYY-MM-DD string. */
export function addDaysToYmd(ymd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

