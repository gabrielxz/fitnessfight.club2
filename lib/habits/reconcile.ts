import type { SupabaseClient } from '@supabase/supabase-js'
import { getSeasonStart } from '@/lib/season'

/**
 * Recomputes a single user's cumulative habit points from scratch based on their
 * habit_entries, and writes the result to user_profiles.cumulative_habit_points.
 *
 * This is the idempotent counterpart to the incremental +0.5 / -0.5 logic in
 * app/api/habits/[id]/entries/route.ts. That incremental path can drift from
 * reality over time — the award write is fire-and-forget (non-blocking, errors
 * only logged), so a lost or double-fired toggle desyncs the counter forever
 * with nothing to correct it. Running this reconcile heals that drift, the same
 * way recalculateAndApplyExercisePointsForWeek keeps exercise points honest.
 *
 * Eligibility matches the award path exactly: only the user's first 5 ACTIVE
 * habits (ordered by position, then created_at) can earn points, and a habit
 * earns 0.5 for each week it meets its target_frequency.
 *
 * Only weeks on or after the current season start count (see lib/season.ts), so
 * entries backfilled for pre-season weeks never earn points. Pass `seasonStart`
 * when reconciling many users to avoid re-reading it per user.
 *
 * Returns the recomputed point total, or null if a read failed (in which case
 * the stored value is left untouched — we never zero someone out on a transient
 * read error).
 */
export async function recalculateHabitPointsForUser(
  supabase: SupabaseClient,
  userId: string,
  seasonStart?: string | null
): Promise<number | null> {
  const floor = seasonStart === undefined ? await getSeasonStart(supabase) : seasonStart

  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, target_frequency')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(5)

  if (habitsError) {
    console.error(`[Habit Reconcile] Failed to load habits for ${userId}`, habitsError)
    return null
  }

  const eligible = habits ?? []
  let points = 0

  if (eligible.length > 0) {
    const targetById = new Map(eligible.map(h => [h.id, h.target_frequency]))
    const habitIds = eligible.map(h => h.id)

    // `${week_start}|${habit_id}` -> number of SUCCESS days that week
    const successByWeekHabit = new Map<string, number>()

    // Paginate past PostgREST's implicit 1000-row cap.
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from('habit_entries')
        .select('habit_id, week_start')
        .eq('status', 'SUCCESS')
        .in('habit_id', habitIds)
      if (floor) query = query.gte('week_start', floor)
      const { data: rows, error } = await query.range(from, from + pageSize - 1)

      if (error) {
        console.error(`[Habit Reconcile] Failed to load entries for ${userId}`, error)
        return null
      }

      for (const r of rows ?? []) {
        const key = `${r.week_start}|${r.habit_id}`
        successByWeekHabit.set(key, (successByWeekHabit.get(key) ?? 0) + 1)
      }

      if (!rows || rows.length < pageSize) break
    }

    for (const [key, count] of successByWeekHabit) {
      const habitId = key.slice(key.indexOf('|') + 1)
      if (count >= (targetById.get(habitId) ?? Infinity)) points += 0.5
    }
  }

  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ cumulative_habit_points: points })
    .eq('id', userId)

  if (updateError) {
    console.error(`[Habit Reconcile] Failed to update points for ${userId}`, updateError)
    return null
  }

  return points
}

/**
 * Reconciles habit points for every user profile. Used by the weekly cron as a
 * self-healing safety net. Returns the number of users successfully reconciled.
 */
export async function reconcileAllHabitPoints(supabase: SupabaseClient): Promise<number> {
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('id')

  if (error) {
    console.error('[Habit Reconcile] Failed to fetch profiles', error)
    return 0
  }

  const seasonStart = await getSeasonStart(supabase)
  let reconciled = 0
  for (const profile of profiles ?? []) {
    const result = await recalculateHabitPointsForUser(supabase, profile.id, seasonStart)
    if (result !== null) reconciled++
  }
  return reconciled
}
