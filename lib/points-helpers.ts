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
