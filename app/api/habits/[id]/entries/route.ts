import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekBoundaries } from '@/lib/date-helpers'
import { recalculateAllWeeklyPoints } from '@/lib/points-helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

// Helper to get week start (Monday) from a date
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const adjustedDay = day === 0 ? 7 : day
  const diff = d.getUTCDate() - (adjustedDay - 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
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
    .select('target_frequency')
    .eq('id', habitId)
    .single()

  if (!habit) return

  const { count: successes, error: countError } = await supabase
    .from('habit_entries')
    .select('*', { count: 'exact', head: true })
    .eq('habit_id', habitId)
    .eq('status', 'SUCCESS')
    .gte('date', weekStartStr)
    .lte('date', weekEndStr)

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
        target: habit.target_frequency,
        percentage: habit.target_frequency > 0 ? ((successes || 0) / habit.target_frequency) * 100 : 0
      },
      {
        onConflict: 'habit_id, week_start'
      }
    )
}

// POST handler to add or update a habit entry for a specific date
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

  if (!date || !status) {
    return NextResponse.json({ error: 'Missing date or status' }, { status: 400 })
  }

  // Validate status
  if (!['SUCCESS', 'FAILURE', 'NEUTRAL'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 })
  }

  // Calculate week_start for this date
  const weekStart = getWeekStart(new Date(date))
  const weekStartStr = weekStart.toISOString().split('T')[0]

  let entry = null
  let error = null

  if (status === 'NEUTRAL') {
    // Delete the entry if it exists (neutral = no entry)
    const { error: deleteError } = await supabase
      .from('habit_entries')
      .delete()
      .eq('habit_id', habitId)
      .eq('date', date)
    
    error = deleteError
  } else {
    // Upsert the habit entry
    const { data, error: upsertError } = await supabase
      .from('habit_entries')
      .upsert(
        {
          habit_id: habitId,
          date: date,
          status: status,
          week_start: weekStartStr
        },
        {
          onConflict: 'habit_id, date'
        }
      )
      .select()
      .single()
    
    entry = data
    error = upsertError
  }

  if (error) {
    console.error('Error updating habit entry:', error)
    return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 })
  }

  // After updating the entry, recalculate weekly summary and then all points
  const userTimezone = user.user_metadata?.timezone || 'UTC'
  await recalculateHabitSummary(user.id, habitId, new Date(date), userTimezone, supabase)
  await recalculateAllWeeklyPoints(user.id, new Date(date), userTimezone, supabase)

  // Fetch updated summary for response
  const { data: summary } = await supabase
    .from('habit_weekly_summaries')
    .select('successes, target, percentage')
    .eq('habit_id', habitId)
    .eq('week_start', weekStartStr)
    .single()

  return NextResponse.json({ 
    entry,
    summary: summary || { successes: 0, target: 0, percentage: 0 }
  })
}