import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekBoundaries } from '@/lib/date-helpers'
import { recalculateAllWeeklyPoints } from '@/lib/points-helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

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

  const { date, completed } = await request.json()
  const { id: habitId } = await params

  if (!date || completed === undefined) {
    return NextResponse.json({ error: 'Missing date or completed status' }, { status: 400 })
  }

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

  return NextResponse.json(entry)
}