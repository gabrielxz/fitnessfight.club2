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

  const entryDate = new Date(date)
  const { weekStart, weekEnd } = getWeekBoundaries(entryDate, timezone)
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  const { data: successEntries, error: entriesError } = await supabase
    .from('habit_entries')
    .select('date', { count: 'exact' })
    .eq('habit_id', habitId)
    .eq('user_id', userId)
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

  const { date, status } = await request.json()
  const { id: habitId } = await params

  if (!date || !status || !['SUCCESS', 'FAILURE', 'NEUTRAL'].includes(status)) {
    return NextResponse.json({ error: 'Missing or invalid date or status' }, { status: 400 })
  }

  try {
    if (status === 'NEUTRAL') {
      await supabase.from('habit_entries').delete().eq('habit_id', habitId).eq('date', date)
    } else {
      await supabase.from('habit_entries').upsert(
        {
          habit_id: habitId,
          user_id: user.id,
          date: date,
          status: status,
          week_start: getWeekBoundaries(new Date(date), user.user_metadata?.timezone || 'UTC').weekStart.toISOString().split('T')[0]
        },
        { onConflict: 'habit_id, date' }
      )
    }
  } catch (error) {
    const errorObj = error as { code?: string; message?: string }
    console.error('[Habit Entry Error]', errorObj)
    return NextResponse.json({ error: 'Failed to update habit entry', details: errorObj.message }, { status: 500 })
  }

  const adminSupabase = createAdminClient()
  await processHabitCompletion(
    adminSupabase,
    user.id,
    habitId,
    date,
    user.user_metadata?.timezone || 'UTC'
  )

  return NextResponse.json({ success: true })
}
