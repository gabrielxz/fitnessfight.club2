#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixHabitSummaries() {
  console.log('Fixing habit summaries for all users...\n')
  
  // Get all users with habits
  const { data: users } = await supabase
    .from('habits')
    .select('user_id')
    .is('archived_at', null)
  
  const uniqueUsers = [...new Set(users?.map(u => u.user_id) || [])]
  
  for (const userId of uniqueUsers) {
    console.log(`Processing user ${userId.substring(0,8)}...`)
    
    // Get all habits for this user
    const { data: habits } = await supabase
      .from('habits')
      .select('id, name, target_frequency')
      .eq('user_id', userId)
      .is('archived_at', null)
    
    for (const habit of habits || []) {
      // Count successes for this week
      const { count: successes } = await supabase
        .from('habit_entries')
        .select('*', { count: 'exact', head: true })
        .eq('habit_id', habit.id)
        .eq('status', 'SUCCESS')
        .gte('date', '2025-09-08')
        .lte('date', '2025-09-14')
      
      const percentage = habit.target_frequency > 0 
        ? (successes / habit.target_frequency) * 100 
        : 0
      
      // Upsert the summary
      const { error } = await supabase
        .from('habit_weekly_summaries')
        .upsert({
          habit_id: habit.id,
          user_id: userId,
          week_start: '2025-09-08',
          successes: successes || 0,
          target: habit.target_frequency,
          percentage: percentage,
          points_earned: successes >= habit.target_frequency ? 0.5 : 0
        }, {
          onConflict: 'habit_id, week_start'
        })
      
      if (error) {
        console.error(`  Error updating summary for ${habit.name}:`, error.message)
      } else if (successes > 0) {
        console.log(`  ${habit.name}: ${successes}/${habit.target_frequency}${successes >= habit.target_frequency ? ' ✓' : ''}`)
      }
    }
  }
  
  console.log('\nNow recalculating points with habit data...\n')
  
  // Recalculate points for all users
  const weekStart = new Date('2025-09-08')
  const weekEnd = new Date('2025-09-14')
  
  for (const userId of uniqueUsers) {
    // 1. Exercise points
    const { data: activities } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', userId)
      .gte('start_date', weekStart.toISOString())
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)
    
    const totalHours = activities?.reduce((sum, a) => sum + (a.moving_time / 3600), 0) || 0
    const exercisePoints = Math.min(totalHours, 10)
    
    // 2. Habit points (first 5 completed habits)
    const { data: summaries } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target')
      .eq('user_id', userId)
      .eq('week_start', '2025-09-08')
      .order('habit_id')
      .limit(5)
    
    const completedHabits = summaries?.filter(h => h.successes >= h.target).length || 0
    const habitPoints = completedHabits * 0.5
    
    // 3. Badge points
    const { data: badges } = await supabase
      .from('user_badges')
      .select('tier')
      .eq('user_id', userId)
    
    let badgePoints = 0
    badges?.forEach(b => {
      if (b.tier === 'gold') badgePoints += 10
      else if (b.tier === 'silver') badgePoints += 6
      else if (b.tier === 'bronze') badgePoints += 3
    })
    
    // 4. Update points
    const { error } = await supabase
      .from('user_points')
      .upsert({
        user_id: userId,
        week_start: '2025-09-08',
        week_end: '2025-09-14',
        exercise_points: exercisePoints,
        habit_points: habitPoints,
        badge_points: badgePoints,
        total_hours: totalHours,
        activities_count: activities?.length || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, week_start'
      })
    
    if (!error) {
      const total = exercisePoints + habitPoints + badgePoints
      console.log(`${userId.substring(0,8)}...: E=${exercisePoints.toFixed(1)}, H=${habitPoints}, B=${badgePoints}, Total=${total.toFixed(1)}`)
    }
  }
  
  console.log('\nDone!')
}

fixHabitSummaries().catch(console.error)