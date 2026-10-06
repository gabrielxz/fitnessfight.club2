import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The current season is the `seasons` row with the latest `starts_on` (always a
 * Monday). `ends_on` (a Sunday) is null while the season is open. Competition
 * Reset closes the current season and inserts the next one, so season bounds
 * are facts in the database rather than constants in code.
 *
 * Points and badges only count for weeks inside the window. Strava activities
 * whose local start date is before the season start are not stored, which stops
 * pre-season backfills (habit entries logged for earlier weeks, a manual Strava
 * sync pulling the last 30 activities) from earning anything after a reset.
 * Activities after the season end are still stored so nothing is lost if a
 * season is extended; they just do not score.
 */
export interface Season {
  id: string
  name: string
  starts_on: string // YYYY-MM-DD, a Monday
  ends_on: string | null // YYYY-MM-DD, a Sunday; null while the season is open
}

export interface SeasonWindow {
  start: string
  end: string | null
}

export async function getCurrentSeason(supabase: SupabaseClient): Promise<Season | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id, name, starts_on, ends_on')
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[Season] Failed to load current season', error)
    return null
  }
  return data
}

/**
 * The current season's scoring window, or null when no season row exists or the
 * read failed. Callers treat null as "no bounds", which keeps a transient read
 * error from zeroing anyone's points.
 */
export async function getSeasonWindow(supabase: SupabaseClient): Promise<SeasonWindow | null> {
  const season = await getCurrentSeason(supabase)
  return season ? { start: season.starts_on, end: season.ends_on } : null
}

/** True when a YYYY-MM-DD date (or ISO timestamp) falls before the season start. */
export function isBeforeSeason(dateStr: string, window: SeasonWindow | null): boolean {
  return window !== null && dateStr.slice(0, 10) < window.start
}

/** True when a YYYY-MM-DD week start or date falls outside the season window. */
export function isOutsideSeason(dateStr: string, window: SeasonWindow | null): boolean {
  if (window === null) return false
  const d = dateStr.slice(0, 10)
  return d < window.start || (window.end !== null && d > window.end)
}
