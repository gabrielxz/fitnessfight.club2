// Rivalry periods are anchored to midnight Pacific Time.
// Season 4 (Apr 6 – Aug 23, 2026) falls entirely within PDT, so offset is fixed at UTC-7.
// If the season ever extends into PST (Nov–Mar), revisit this.
export const RIVALRY_TZ_OFFSET_HOURS = 7

const MS_PER_HOUR = 60 * 60 * 1000

/**
 * The "rivalry day" for the current instant, formatted as YYYY-MM-DD.
 * Shifts the UTC clock back by the rivalry timezone offset so that a period
 * whose end_date is 2026-04-19 still counts as "today" at 2 AM UTC on Apr 20
 * (which is 7 PM PDT on Apr 19).
 */
export function rivalryTodayStr(now: Date = new Date()): string {
  return new Date(now.getTime() - RIVALRY_TZ_OFFSET_HOURS * MS_PER_HOUR)
    .toISOString()
    .split('T')[0]
}

/** UTC timestamp for the start of the period (midnight Pacific on start_date). */
export function periodStartUTC(startDate: string): string {
  return `${startDate}T${String(RIVALRY_TZ_OFFSET_HOURS).padStart(2, '0')}:00:00Z`
}

/** UTC timestamp for the end of the period (midnight Pacific on day AFTER end_date). */
export function periodEndUTC(endDate: string): string {
  const d = new Date(`${endDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const next = d.toISOString().split('T')[0]
  return `${next}T${String(RIVALRY_TZ_OFFSET_HOURS).padStart(2, '0')}:00:00Z`
}
