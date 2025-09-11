
import { SupabaseClient } from '@supabase/supabase-js'
import { getWeekBoundaries } from '@/lib/date-helpers'

// Recalculates all points for a user for a given week based on a date within that week.
export async function recalculateAllWeeklyPoints(
  userId: string,
  dateInWeek: Date,
  timezone: string,
  supabase: SupabaseClient
) {
  try {
    const { weekStart, weekEnd } = getWeekBoundaries(dateInWeek, timezone)
    
    // 1. Calculate Exercise Points
    const { data: activities, error: activitiesError } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', userId)
      .gte('start_date', weekStart.toISOString())
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)
    
    if (activitiesError) throw activitiesError
    
    const totalHours = activities.reduce((sum, a) => sum + (a.moving_time / 3600), 0)
    const exercisePoints = Math.min(totalHours, 10)

    // 2. Calculate Habit Points
    const weekStartStr = weekStart.toISOString().split('T')[0]
    
    // First get the user's habits ordered by position to know which 5 are eligible
    const { data: habits, error: habitsListError } = await supabase
      .from('habits')
      .select('id')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('position')
      .order('created_at')
      .limit(5)
    
    if (habitsListError) throw habitsListError
    
    const eligibleHabitIds = habits?.map(h => h.id) || []
    
    // Now get summaries for eligible habits
    const { data: summaries, error: habitsError } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target, points_earned, habit_id')
      .eq('user_id', userId)
      .eq('week_start', weekStartStr)
      .in('habit_id', eligibleHabitIds)

    if (habitsError) throw habitsError

    // Sum up the points from eligible habits
    const habitPoints = summaries?.reduce((sum, s) => sum + (s.points_earned || 0), 0) || 0

    // 3. Calculate Badge Points
    const { data: badges, error: badgesError } = await supabase
      .from('user_badges')
      .select('tier')
      .eq('user_id', userId)
    
    if (badgesError) throw badgesError
    
    let badgePoints = 0
    if (badges) {
      badges.forEach(badge => {
        if (badge.tier === 'gold') badgePoints += 10
        else if (badge.tier === 'silver') badgePoints += 6
        else if (badge.tier === 'bronze') badgePoints += 3
      })
    }

    // 4. Upsert the unified user_points record
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const { error: upsertError } = await supabase
      .from('user_points')
      .upsert({
        user_id: userId,
        week_start: weekStartStr,
        week_end: weekEndStr,
        exercise_points: exercisePoints,
        habit_points: habitPoints,
        badge_points: badgePoints,
        total_hours: totalHours,
        activities_count: activities.length,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, week_start'
      })

    if (upsertError) throw upsertError

    console.log(`Recalculated points for user ${userId} for week starting ${weekStartStr}: Exercise=${exercisePoints.toFixed(2)}, Habit=${habitPoints.toFixed(2)}, Badge=${badgePoints}`)

  } catch (error) {
    console.error(`Error calculating all weekly points for user ${userId}:`, error)
  }
}
