
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekBoundaries } from '@/lib/date-helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

// This function is now in the Strava webhook file, but should be centralized.
// For now, we are assuming it's available here.
// In a future refactor, this could be moved to a shared /lib file.
async function recalculateAllWeeklyPoints(
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
    const { data: summaries, error: habitsError } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target')
      .eq('user_id', userId)
      .eq('week_start', weekStartStr)

    if (habitsError) throw habitsError

    const completedHabits = summaries.filter(h => h.successes >= h.target).length
    const habitPoints = Math.min(completedHabits * 0.5, 2.5)

    // 3. Upsert the unified user_points record
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const { error: upsertError } = await supabase
      .from('user_points')
      .upsert({
        user_id: userId,
        week_start: weekStartStr,
        week_end: weekEndStr,
        exercise_points: exercisePoints,
        habit_points: habitPoints,
        badge_points: 0, // Placeholder for now
        total_hours: totalHours,
        activities_count: activities?.length || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, week_start'
      })

    if (upsertError) throw upsertError

    console.log(`Recalculated points for user ${userId} for week starting ${weekStartStr}: Exercise=${exercisePoints.toFixed(2)}, Habit=${habitPoints.toFixed(2)}`)

  } catch (error) {
    console.error(`Error calculating all weekly points for user ${userId}:`, error)
  }
}


// POST handler to add or update a habit entry for a specific date
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { response, session } = await getSession(request)
  const user = session?.user

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { date, completed } = await request.json()
  const habitId = params.id

  if (!date || completed === undefined) {
    return NextResponse.json({ error: 'Missing date or completed status' }, { status: 400 })
  }

  const supabase = createClient()

  // Upsert the habit entry
  const { data: entry, error } = await supabase
    .from('habit_entries')
    .upsert(
      {
        habit_id: habitId,
        user_id: user.id,
        entry_date: date,
        completed: completed
      },
      {
        onConflict: 'habit_id, entry_date'
      }
    )
    .select()
    .single()

  if (error) {
    console.error('Error upserting habit entry:', error)
    return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 })
  }

  // After updating the entry, recalculate weekly summary and then all points
  const userTimezone = user.user_metadata.timezone || 'UTC'
  await recalculateHabitSummary(user.id, habitId, new Date(date), userTimezone, supabase)
  await recalculateAllWeeklyPoints(user.id, new Date(date), userTimezone, supabase)

  return NextResponse.json(entry, { headers: response.headers })
}

// Recalculate weekly summary for a single habit
async function recalculateHabitSummary(
  userId: string,
  habitId: string,
  entryDate: Date,
  timezone: string,
  supabase: SupabaseClient
) {
  const { weekStart, weekEnd } = getWeekBoundaries(entryDate, timezone)
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  const { data: habit } = await supabase
    .from('habits')
    .select('target')
    .eq('id', habitId)
    .single()

  if (!habit) return

  const { count: successes, error: countError } = await supabase
    .from('habit_entries')
    .select('*', { count: 'exact', head: true })
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('entry_date', weekStartStr)
    .lte('entry_date', weekEndStr)

  if (countError) {
    console.error('Error counting habit successes:', countError)
    return
  }

  await supabase
    .from('habit_weekly_summaries')
    .upsert(
      {
        user_id: userId,
        habit_id: habitId,
        week_start: weekStartStr,
        successes: successes || 0,
        target: habit.target
      },
      {
        onConflict: 'user_id, habit_id, week_start'
      }
    )
}
