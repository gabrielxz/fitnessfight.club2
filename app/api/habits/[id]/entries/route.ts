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

  if (!habit) {
    console.error('Habit not found:', habitId)
    return
  }

  // Count all SUCCESS entries for this week
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

  console.log(`[SUMMARY] Habit ${habitId}: ${successes}/${habit.target_frequency} successes for week ${weekStartStr}`)

  // Calculate if this habit is completed
  const isCompleted = (successes || 0) >= habit.target_frequency
  const percentage = habit.target_frequency > 0 ? ((successes || 0) / habit.target_frequency) * 100 : 0

  // Upsert the summary with points_earned field
  const { data: summaryData, error: upsertError } = await supabase
    .from('habit_weekly_summaries')
    .upsert(
      {
        user_id: userId,
        habit_id: habitId,
        week_start: weekStartStr,
        successes: successes || 0,
        target: habit.target_frequency,
        percentage: percentage,
        points_earned: isCompleted ? 0.5 : 0
      },
      {
        onConflict: 'habit_id, week_start'
      }
    )
    .select()
    .single()

  if (upsertError) {
    console.error('[CRITICAL] Error upserting habit summary:', upsertError)
    console.error('Summary data attempted:', {
      user_id: userId,
      habit_id: habitId,
      week_start: weekStartStr,
      successes: successes || 0,
      target: habit.target_frequency,
      points_earned: isCompleted ? 0.5 : 0
    })
    
    // Check if it's an RLS error
    if (upsertError.code === '42501') {
      console.error('[RLS ERROR] Row Level Security blocked the summary update')
      throw new Error('RLS Policy Error: Cannot update habit summary. Please contact support.')
    }
    
    throw upsertError
  }
  
  console.log('[SUMMARY UPDATED]', summaryData)

  return { 
    successes: successes || 0, 
    target: habit.target_frequency, 
    percentage,
    points_earned: isCompleted ? 0.5 : 0
  }
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

  console.log(`[HABIT UPDATE] User: ${user.id}, Habit: ${habitId}, Date: ${date}, Status: ${status}`)

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

  // Use RPC to update entry and summary in a transaction
  let entry = null
  
  try {
    if (status === 'NEUTRAL') {
      // Delete the entry if it exists (neutral = no entry)
      const { error: deleteError } = await supabase
        .from('habit_entries')
        .delete()
        .eq('habit_id', habitId)
        .eq('date', date)
      
      if (deleteError) {
        console.error('[DELETE ERROR]', deleteError)
        throw deleteError
      }
      console.log(`[DELETED] Entry for habit ${habitId} on ${date} (NEUTRAL status)`)
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
      
      if (upsertError) {
        console.error('[UPSERT ERROR]', upsertError)
        throw upsertError
      }
      
      entry = data
      console.log(`[UPSERTED] Entry for habit ${habitId} on ${date} with status ${status}`)
    }
  } catch (error) {
    console.error('[TRANSACTION ERROR] Failed to update habit entry:', error)
    
    // Check for RLS errors
    const errorObj = error as { code?: string; message?: string }
    if (errorObj.code === '42501') {
      return NextResponse.json({ 
        error: 'Permission denied. Please refresh the page and try again.' 
      }, { status: 403 })
    }
    
    return NextResponse.json({ 
      error: 'Failed to update habit',
      details: errorObj.message || 'Unknown error'
    }, { status: 500 })
  }

  // After updating the entry, recalculate weekly summary and then all points
  const userTimezone = user.user_metadata?.timezone || 'UTC'
  
  // First recalculate the habit summary
  const updatedSummary = await recalculateHabitSummary(user.id, habitId, new Date(date), userTimezone, supabase)
  
  // Then recalculate all weekly points (including the updated habit points)
  try {
    const updatedPoints = await recalculateAllWeeklyPoints(user.id, new Date(date), userTimezone, supabase)
    console.log(`[POINTS] Recalculated for user ${user.id}: Exercise=${updatedPoints?.exercisePoints}, Habit=${updatedPoints?.habitPoints}, Badge=${updatedPoints?.badgePoints}, Total=${updatedPoints?.totalPoints}`)
  } catch (pointsError) {
    console.error('[POINTS ERROR] Failed to recalculate points:', pointsError)
  }

  return NextResponse.json({ 
    entry,
    summary: updatedSummary || { successes: 0, target: 0, percentage: 0, points_earned: 0 }
  })
}