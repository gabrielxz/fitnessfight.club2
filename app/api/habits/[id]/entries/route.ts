import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekBoundaries } from '@/lib/date-helpers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

async function processHabitCompletion(
  supabase: SupabaseClient,
  userId: string,
  habitId: string,
  date: string,
  timezone: string
) {
  const { data: habit, error: habitError } = await supabase
    .from('habits')
    .select('target_frequency, position')
    .eq('id', habitId)
    .single()

  if (habitError || !habit) {
    console.error(`[Habit Points] Could not find habit ${habitId}`)
    return
  }

  if (habit.position >= 5) {
    console.log(`[Habit Points] Habit ${habitId} is not eligible for points (position ${habit.position})`)
    return
  }

  // Parse the date string in the user's timezone by appending time
  const entryDate = new Date(date + 'T12:00:00') // Use noon to avoid timezone parsing bugs
  const { weekStart, weekEnd } = getWeekBoundaries(entryDate, timezone)
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  const { data: successEntries, error: entriesError } = await supabase
    .from('habit_entries')
    .select('date', { count: 'exact' })
    .eq('habit_id', habitId)
    .eq('status', 'SUCCESS')
    .gte('date', weekStartStr)
    .lte('date', weekEndStr)

  if (entriesError) {
    console.error(`[Habit Points] Error fetching habit entries:`, entriesError)
    return
  }

  const totalSuccesses = successEntries.length
  const target = habit.target_frequency

  if (totalSuccesses < target) {
    return
  }

  const previousSuccessCount = successEntries.filter(e => new Date(e.date).getTime() !== entryDate.getTime()).length

  if (previousSuccessCount < target) {
    console.log(`[Habit Points] Habit ${habitId} completed for week ${weekStartStr}. Awarding points.`)
    
    const { error: rpcError } = await supabase.rpc('increment_habit_points', {
      p_user_id: userId,
      p_points_to_add: 0.5,
    })

    if (rpcError) {
      console.error(`[Habit Points] Error incrementing habit points:`, rpcError)
    }
  } else {
    console.log(`[Habit Points] Habit ${habitId} was already completed for week ${weekStartStr}. No points to award.`)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's timezone from profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', user.id)
    .single()

  const userTimezone = profile?.timezone || 'America/New_York'

  const { date, status } = await request.json()
  const { id: habitId } = await params

  if (!date || !status || !['SUCCESS', 'FAILURE', 'NEUTRAL'].includes(status)) {
    return NextResponse.json({ error: 'Missing or invalid date or status' }, { status: 400 })
  }

  // First verify the habit belongs to the user
  const { data: habit, error: habitError } = await supabase
    .from('habits')
    .select('id')
    .eq('id', habitId)
    .eq('user_id', user.id)
    .single()

  if (habitError || !habit) {
    console.error('[Habit Entry Error] Habit not found or not owned by user', habitError)
    return NextResponse.json({ error: 'Habit not found' }, { status: 404 })
  }

  // Now update the entry
  let entry = null
  // Parse the date string in the user's timezone by appending time
  // The date comes from the client as "YYYY-MM-DD" which needs to be interpreted in the user's timezone
  const dateInUserTZ = new Date(date + 'T12:00:00') // Use noon to avoid DST edge cases
  const weekStartDate = getWeekBoundaries(dateInUserTZ, userTimezone).weekStart.toISOString().split('T')[0]

  if (status === 'NEUTRAL') {
    const { error } = await supabase
      .from('habit_entries')
      .delete()
      .eq('habit_id', habitId)
      .eq('date', date)

    if (error) {
      console.error('[Habit Entry Error] Delete failed:', error)
      return NextResponse.json({ error: 'Failed to delete habit entry', details: error.message }, { status: 500 })
    }
  } else {
    const { data, error } = await supabase
      .from('habit_entries')
      .upsert(
        {
          habit_id: habitId,
          date: date,
          status: status,
          week_start: weekStartDate
        },
        { onConflict: 'habit_id, date' }
      )
      .select()
      .single()

    if (error) {
      console.error('[Habit Entry Error] Upsert failed:', error)
      return NextResponse.json({ error: 'Failed to update habit entry', details: error.message }, { status: 500 })
    }

    entry = data
  }

  // Process habit completion asynchronously (non-blocking)
  // This means we return to the client immediately while points are calculated in background
  if (status === 'SUCCESS') {
    const adminSupabase = createAdminClient()
    processHabitCompletion(
      adminSupabase,
      user.id,
      habitId,
      date,
      userTimezone
    ).catch(error => {
      console.error('[Habit Points] Background processing failed:', error)
    })
  }

  // Return minimal response for speed
  // Client calculates summary optimistically
  return NextResponse.json({
    success: true,
    entry
  })
}
