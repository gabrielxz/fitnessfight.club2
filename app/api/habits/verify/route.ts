import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/habits/verify - Verify and fix habit data consistency
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const issues: Array<{
      habit: string
      issue: string
      expected: { successes: number; points: number } | null
      actual: { successes: number; points: number } | null
    }> = []
    
    const fixes: Array<{
      habit: string
      action: string
      status: string
      error?: string
    }> = []
    
    // Get current week boundaries (Monday to Sunday)
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
    
    console.log(`[VERIFY] Checking habits for user ${user.id} for week ${weekStartStr} to ${weekEndStr}`)
    
    // Get all user's habits
    const { data: habits, error: habitsError } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .is('archived_at', null)
    
    if (habitsError) {
      console.error('[VERIFY ERROR] Failed to fetch habits:', habitsError)
      return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 })
    }
    
    // Check each habit
    for (const habit of habits || []) {
      // Count actual SUCCESS entries
      const { data: entries, count: actualSuccesses } = await supabase
        .from('habit_entries')
        .select('*', { count: 'exact' })
        .eq('habit_id', habit.id)
        .eq('status', 'SUCCESS')
        .gte('date', weekStartStr)
        .lte('date', weekEndStr)
      
      // Get stored summary
      const { data: summary } = await supabase
        .from('habit_weekly_summaries')
        .select('*')
        .eq('habit_id', habit.id)
        .eq('week_start', weekStartStr)
        .single()
      
      const expectedSuccesses = actualSuccesses || 0
      const expectedPoints = expectedSuccesses >= habit.target_frequency ? 0.5 : 0
      
      // Check for mismatches
      if (!summary) {
        issues.push({
          habit: habit.name,
          issue: 'Missing summary',
          expected: { successes: expectedSuccesses, points: expectedPoints },
          actual: null
        })
        
        // Fix: Create the summary
        const { error: createError } = await supabase
          .from('habit_weekly_summaries')
          .insert({
            habit_id: habit.id,
            user_id: user.id,
            week_start: weekStartStr,
            successes: expectedSuccesses,
            target: habit.target_frequency,
            percentage: habit.target_frequency > 0 ? (expectedSuccesses / habit.target_frequency) * 100 : 0,
            points_earned: expectedPoints
          })
        
        if (createError) {
          console.error('[VERIFY FIX ERROR] Failed to create summary:', createError)
          fixes.push({
            habit: habit.name,
            action: 'Create summary',
            status: 'failed',
            error: createError.message
          })
        } else {
          fixes.push({
            habit: habit.name,
            action: 'Create summary',
            status: 'success'
          })
        }
      } else if (summary.successes !== expectedSuccesses || summary.points_earned !== expectedPoints) {
        issues.push({
          habit: habit.name,
          issue: 'Mismatch in summary',
          expected: { successes: expectedSuccesses, points: expectedPoints },
          actual: { successes: summary.successes, points: summary.points_earned }
        })
        
        // Fix: Update the summary
        const { error: updateError } = await supabase
          .from('habit_weekly_summaries')
          .update({
            successes: expectedSuccesses,
            percentage: habit.target_frequency > 0 ? (expectedSuccesses / habit.target_frequency) * 100 : 0,
            points_earned: expectedPoints,
            updated_at: new Date().toISOString()
          })
          .eq('id', summary.id)
        
        if (updateError) {
          console.error('[VERIFY FIX ERROR] Failed to update summary:', updateError)
          fixes.push({
            habit: habit.name,
            action: 'Update summary',
            status: 'failed',
            error: updateError.message
          })
        } else {
          fixes.push({
            habit: habit.name,
            action: 'Update summary',
            status: 'success'
          })
        }
      }
      
      // Log all entries for debugging
      console.log(`[VERIFY] ${habit.name}: ${expectedSuccesses}/${habit.target_frequency} = ${expectedPoints} pts`)
      if (entries) {
        entries.forEach(e => {
          console.log(`  - ${e.date}: ${e.status}`)
        })
      }
    }
    
    // Recalculate total points if we made fixes
    if (fixes.length > 0) {
      console.log('[VERIFY] Recalculating total points after fixes...')
      
      // Get first 5 habits for points eligibility
      const { data: eligibleHabits } = await supabase
        .from('habits')
        .select('id')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('position')
        .order('created_at')
        .limit(5)
      
      const eligibleIds = eligibleHabits?.map(h => h.id) || []
      
      // Get summaries for eligible habits
      const { data: summaries } = await supabase
        .from('habit_weekly_summaries')
        .select('points_earned')
        .eq('user_id', user.id)
        .eq('week_start', weekStartStr)
        .in('habit_id', eligibleIds)
      
      const habitPoints = summaries?.reduce((sum, s) => sum + (s.points_earned || 0), 0) || 0
      
      // Update user_points
      const { error: pointsError } = await supabase
        .from('user_points')
        .update({
          habit_points: habitPoints,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('week_start', weekStartStr)
      
      if (pointsError) {
        console.error('[VERIFY] Failed to update user_points:', pointsError)
      } else {
        console.log(`[VERIFY] Updated user_points with habit_points=${habitPoints}`)
      }
    }
    
    return NextResponse.json({
      success: true,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      habitsChecked: habits?.length || 0,
      issues: issues,
      fixes: fixes,
      message: issues.length === 0 ? 'All habit data is consistent!' : `Found and fixed ${fixes.length} issues`
    })
    
  } catch (error) {
    console.error('[VERIFY] Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Failed to verify habits',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}