
import { startOfWeek, endOfWeek } from 'date-fns'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'

/**
 * Gets the start and end of a week (Monday-Sunday) for a given date and timezone.
 * All calculations are performed in the user's local time, and the final
 * boundaries are returned as UTC Date objects.
 *
 * @param date The date to determine the week for (can be a Date object or string).
 * @param timezone The user's IANA timezone string (e.g., 'America/New_York').
 * @returns An object containing the weekStart and weekEnd as UTC Date objects.
 */
export function getWeekBoundaries(
  date: Date | string,
  timezone: string
): { weekStart: Date; weekEnd: Date } {
  // 1. Convert the incoming UTC date to the user's local timezone.
  const zonedDate = utcToZonedTime(date, timezone)

  // 2. Calculate the start of the week (Monday) in the user's timezone.
  const weekStartLocal = startOfWeek(zonedDate, { weekStartsOn: 1 /* Monday */ })

  // 3. Calculate the end of the week (Sunday) in the user's timezone.
  const weekEndLocal = endOfWeek(zonedDate, { weekStartsOn: 1 /* Monday */ })

  // 4. Convert the local start and end boundaries back to UTC for storage.
  const weekStart = zonedTimeToUtc(weekStartLocal, timezone)
  const weekEnd = zonedTimeToUtc(weekEndLocal, timezone)

  return { weekStart, weekEnd }
}

/**
 * Gets the boundaries of the week *previous* to the given date, in a specific timezone.
 * Useful for cron jobs processing a completed week.
 *
 * @param date The date to reference (e.g., new Date() when the job runs).
 * @param timezone The user's IANA timezone string.
 * @returns An object containing the weekStart and weekEnd as UTC Date objects.
 */
export function getPreviousWeekBoundaries(
  date: Date | string,
  timezone: string
): { weekStart: Date; weekEnd: Date } {
  // 1. Convert the incoming UTC date to the user's local timezone.
  const zonedDate = utcToZonedTime(date, timezone)

  // 2. Go back 7 days to ensure we are in the previous week.
  zonedDate.setDate(zonedDate.getDate() - 7)

  // 3. Calculate the boundaries for that previous week.
  return getWeekBoundaries(zonedDate, timezone)
}
