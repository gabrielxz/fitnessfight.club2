import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

// Rivalry periods are anchored to midnight Pacific Time, with DST handled by the
// IANA zone: midnight is 07:00 UTC under PDT and 08:00 UTC under PST.
export const RIVALRY_TZ = 'America/Los_Angeles'

/** Adds days to a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * The "rivalry day" for the current instant, formatted as YYYY-MM-DD in Pacific
 * Time. A period whose end_date is 2026-04-19 still counts as "today" at 2 AM UTC
 * on Apr 20 (7 PM PDT on Apr 19).
 */
export function rivalryTodayStr(now: Date = new Date()): string {
  return formatInTimeZone(now, RIVALRY_TZ, 'yyyy-MM-dd')
}

/** UTC timestamp for the start of the period (midnight Pacific on start_date). */
export function periodStartUTC(startDate: string): string {
  return fromZonedTime(`${startDate}T00:00:00`, RIVALRY_TZ).toISOString()
}

/** UTC timestamp for the end of the period (midnight Pacific on the day AFTER end_date). */
export function periodEndUTC(endDate: string): string {
  return fromZonedTime(`${addDays(endDate, 1)}T00:00:00`, RIVALRY_TZ).toISOString()
}

/**
 * True during the first hour of Monday in Pacific Time. The weekly cron is
 * scheduled at both 07:05 and 08:05 UTC so that one firing lands in this hour
 * under PDT and the other under PST; the off-hour firing skips itself.
 */
export function isRivalryMondayFirstHour(now: Date = new Date()): boolean {
  return formatInTimeZone(now, RIVALRY_TZ, 'i HH') === '1 00'
}
