import { SupabaseClient } from '@supabase/supabase-js'
import { getWeekBoundaries } from '@/lib/date-helpers'

/**
 * Recalculates the total exercise points for a given week and applies the difference
 * to the user's cumulative score. This is idempotent and safe to call for creates,
 * updates, and deletes.
 *
 * @param userId The user's ID.
 * @param dateInWeek A date within the week to recalculate.
 * @param timezone The user's timezone.
 * @param supabase An admin Supabase client instance.
 */
export async function recalculateAndApplyExercisePointsForWeek(
  userId: string,
  dateInWeek: Date,
  timezone: string,
  supabase: SupabaseClient
) {
  try {
    const { weekStart, weekEnd } = getWeekBoundaries(dateInWeek, timezone)
    const weekStartStr = weekStart.toISOString().split('T')[0]

    // 1. Get all activities for the week from the DB
    const { data: activities, error: activitiesError } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', userId)
      .gte('start_date', weekStart.toISOString())
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)

    if (activitiesError) throw activitiesError

    const newTotalHours = activities.reduce((sum, a) => sum + (a.moving_time / 3600), 0)

    // 2. Get the previously tracked hours for this week
    const { data: tracking, error: trackingError } = await supabase
      .from('weekly_exercise_tracking')
      .select('hours_logged')
      .eq('user_id', userId)
      .eq('week_start', weekStartStr)
      .single()

    if (trackingError && trackingError.code !== 'PGRST116') {
      // Ignore 'PGRST116' - no rows found, which is a valid case.
      throw trackingError
    }

    const previouslyTrackedHours = tracking?.hours_logged || 0

    // 3. Calculate the difference in points to apply
    const pointsAlreadyAwarded = Math.min(previouslyTrackedHours, 9)
    const newTotalPointsForWeek = Math.min(newTotalHours, 9)
    const pointDifference = newTotalPointsForWeek - pointsAlreadyAwarded

    // 4. If there's a change, apply it to the cumulative score
    if (pointDifference !== 0) {
      const { error: rpcError } = await supabase.rpc('increment_exercise_points', {
        p_user_id: userId,
        p_points_to_add: pointDifference, // Can be positive or negative
      })

      if (rpcError) throw rpcError

      console.log(
        `Applied ${pointDifference.toFixed(2)} exercise points difference to user ${userId}`
      )
    }

    // 5. Upsert the new total hours for the week into the tracking table
    const { error: upsertError } = await supabase
      .from('weekly_exercise_tracking')
      .upsert(
        {
          user_id: userId,
          week_start: weekStartStr,
          hours_logged: newTotalHours,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id, week_start',
        }
      )

    if (upsertError) throw upsertError

    return { pointDifference }
  } catch (error) {
    console.error(
      `Error recalculating exercise points for user ${userId} and week of ${dateInWeek}:`,
      error
    )
  }
}

/**
 * Recomputes a user's cumulative exercise points from their weekly tracking rows
 * and writes the result to user_profiles.cumulative_exercise_points.
 *
 * recalculateAndApplyExercisePointsForWeek only ever applies a per-week *diff*,
 * so if a week's activities or tracking row are removed out-of-band (bulk
 * deletes, partial resets) the cumulative counter keeps orphaned points that no
 * tracking row justifies. This reconcile heals that drift by summing the capped
 * weekly hours (min(hours_logged, 9)) across all of the user's tracking rows —
 * the exercise counterpart to lib/habits/reconcile.ts.
 *
 * Returns the recomputed total, or null on a read error (stored value left
 * untouched — never zero someone out on a transient failure).
 */
export async function reconcileExercisePointsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<number | null> {
  const rows: { hours_logged: number | null }[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('weekly_exercise_tracking')
      .select('hours_logged')
      .eq('user_id', userId)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error(`[Exercise Reconcile] Failed to load tracking for ${userId}`, error)
      return null
    }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }

  const points = rows.reduce((sum, r) => sum + Math.min(r.hours_logged ?? 0, 9), 0)

  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({ cumulative_exercise_points: points })
    .eq('id', userId)

  if (updateError) {
    console.error(`[Exercise Reconcile] Failed to update points for ${userId}`, updateError)
    return null
  }
  return points
}

/**
 * Reconciles exercise points for every user profile. Used by the weekly cron as
 * a self-healing safety net. Returns the number of users successfully reconciled.
 */
export async function reconcileAllExercisePoints(supabase: SupabaseClient): Promise<number> {
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('id')

  if (error) {
    console.error('[Exercise Reconcile] Failed to fetch profiles', error)
    return 0
  }

  let reconciled = 0
  for (const profile of profiles ?? []) {
    const result = await reconcileExercisePointsForUser(supabase, profile.id)
    if (result !== null) reconciled++
  }
  return reconciled
}
