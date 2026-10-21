import type { StatsFilter } from "./types";
const DAY = 86_400_000;
export function shanghaiDay(instant: Date): string {
  return new Date(instant.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}
function date(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("Invalid date");
  return parsed;
}
export function resolveStatsRange(
  filter: StatsFilter = {},
  instant = new Date(),
) {
  const today = date(shanghaiDay(instant));
  const year = today.getUTCFullYear(),
    month = today.getUTCMonth();
  let from: string, to: string;
  const period =
    filter.period ?? (filter.from || filter.to ? "custom" : "month");
  if (period === "custom") {
    if (!filter.from || !filter.to) throw new Error("Both dates are required");
    from = filter.from;
    to = filter.to;
  } else {
    if (filter.from || filter.to)
      throw new Error("Dates require custom period");
    if (!["month", "quarter", "year"].includes(period))
      throw new Error("Invalid period");
    const firstMonth =
      period === "year"
        ? 0
        : period === "quarter"
          ? Math.floor(month / 3) * 3
          : month;
    const months = period === "year" ? 12 : period === "quarter" ? 3 : 1;
    from = new Date(Date.UTC(year, firstMonth, 1)).toISOString().slice(0, 10);
    to = new Date(Date.UTC(year, firstMonth + months, 0))
      .toISOString()
      .slice(0, 10);
  }
  const first = date(from),
    last = date(to);
  const limit = new Date(first);
  limit.setUTCFullYear(limit.getUTCFullYear() + 2);
  if (last < first || last.getTime() + DAY > limit.getTime())
    throw new Error("Date range must be ordered and at most two years");
  return {
    start: new Date(first.getTime() - 8 * 3_600_000),
    end: new Date(last.getTime() + DAY - 8 * 3_600_000),
    from,
    to,
  };
}
