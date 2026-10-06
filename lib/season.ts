import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The current season is the `seasons` row with the latest `starts_on` (always a
 * Monday). Competition Reset inserts a new row, so the season start is a fact in
 * the database rather than a constant in code.
 *
 * Points only count for weeks whose `week_start` is on or after the season start,
 * and Strava activities whose local start date is before it are not stored. This
 * stops pre-season backfills (habit entries logged for earlier weeks, a manual
 * Strava sync pulling the last 30 activities) from earning points after a reset.
 */
export interface Season {
  id: string
  name: string
  starts_on: string // YYYY-MM-DD, a Monday
}

export async function getCurrentSeason(supabase: SupabaseClient): Promise<Season | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id, name, starts_on')
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
 * Season start as YYYY-MM-DD, or null when no season row exists or the read
 * failed. Callers treat null as "no floor", which keeps a transient read error
 * from zeroing anyone's points.
 */
export async function getSeasonStart(supabase: SupabaseClient): Promise<string | null> {
  return (await getCurrentSeason(supabase))?.starts_on ?? null
}

/** True when a YYYY-MM-DD week start or local date falls before the season start. */
export function isBeforeSeason(dateStr: string, seasonStart: string | null): boolean {
  return seasonStart !== null && dateStr.slice(0, 10) < seasonStart
}
