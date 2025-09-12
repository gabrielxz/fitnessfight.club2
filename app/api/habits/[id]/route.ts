import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recalculateAllWeeklyPoints } from '@/lib/points-helpers'

// PATCH /api/habits/[id] - Update habit name/frequency
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, target_frequency } = body

    // Build update object
    const updateData: Record<string, string | number> = {}
    
    if (name !== undefined) {
      if (name.length > 100) {
        return NextResponse.json({ error: 'Name must be 100 characters or less' }, { status: 400 })
      }
      updateData.name = name
    }

    if (target_frequency !== undefined) {
      if (target_frequency < 1 || target_frequency > 7) {
        return NextResponse.json({ error: 'Target frequency must be between 1 and 7' }, { status: 400 })
      }
      updateData.target_frequency = target_frequency
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Update the habit
    const { data: habit, error } = await supabase
      .from('habits')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating habit:', error)
      return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 })
    }

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 })
    }
    
    // If target_frequency was changed, recalculate summary and points
    if (target_frequency !== undefined) {
      console.log(`[HABIT UPDATE] Target frequency changed for habit ${params.id} to ${target_frequency}`)
      
      // Get current week boundaries
      const now = new Date()
      const currentDay = now.getUTCDay()
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1
      const weekStart = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysToMonday,
        0, 0, 0, 0
      ))
      const weekEnd = new Date(weekStart)
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
      
      const weekStartStr = weekStart.toISOString().split('T')[0]
      const weekEndStr = weekEnd.toISOString().split('T')[0]
      
      // Count SUCCESS entries for this week
      const { count: successes } = await supabase
        .from('habit_entries')
        .select('*', { count: 'exact', head: true })
        .eq('habit_id', params.id)
        .eq('status', 'SUCCESS')
        .gte('date', weekStartStr)
        .lte('date', weekEndStr)
      
      const actualSuccesses = successes || 0
      const isCompleted = actualSuccesses >= target_frequency
      const percentage = target_frequency > 0 ? (actualSuccesses / target_frequency) * 100 : 0
      const pointsEarned = isCompleted ? 0.5 : 0
      
      console.log(`[HABIT UPDATE] Recalculating: ${actualSuccesses}/${target_frequency} = ${pointsEarned} pts`)
      
      // Update the weekly summary
      const { error: summaryError } = await supabase
        .from('habit_weekly_summaries')
        .upsert({
          habit_id: params.id,
          user_id: user.id,
          week_start: weekStartStr,
          successes: actualSuccesses,
          target: target_frequency,
          percentage: percentage,
          points_earned: pointsEarned,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'habit_id, week_start'
        })
      
      if (summaryError) {
        console.error('[HABIT UPDATE] Error updating summary:', summaryError)
      }
      
      // Recalculate total weekly points
      try {
        const userTimezone = user.user_metadata?.timezone || 'UTC'
        await recalculateAllWeeklyPoints(user.id, now, userTimezone, supabase)
        console.log('[HABIT UPDATE] Points recalculated after target change')
      } catch (pointsError) {
        console.error('[HABIT UPDATE] Failed to recalculate points:', pointsError)
      }
    }

    return NextResponse.json({ habit })
  } catch (error) {
    console.error('Error in PATCH /api/habits/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/habits/[id] - Soft delete habit
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Soft delete by setting archived_at
    const { data: habit, error } = await supabase
      .from('habits')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error deleting habit:', error)
      return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 })
    }

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/habits/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}