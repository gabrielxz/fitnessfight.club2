#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixHabitSystem() {
  console.log('=' .repeat(60))
  console.log('FIXING HABIT SYSTEM')
  console.log('=' .repeat(60))
  
  // Step 1: FAILURE entries are now valid - they're visual markers but count as 0 for points
  console.log('\n1. Checking FAILURE entries (valid for tracking, count as 0 for points)...')
  const { data: failures, error: fetchError } = await supabase
    .from('habit_entries')
    .select('id, habit_id, date, status')
    .eq('status', 'FAILURE')
  
  if (failures && failures.length > 0) {
    console.log(`   Found ${failures.length} FAILURE entries (these are valid, count as 0 for points)`)
  } else {
    console.log('   No FAILURE entries found')
  }
  
  // Step 2: Rebuild ALL summaries from scratch
  console.log('\n2. Rebuilding all habit summaries...')
  
  // Delete all summaries first
  await supabase
    .from('habit_weekly_summaries')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  
  // Get all habits
  const { data: habits } = await supabase
    .from('habits')
    .select('id, user_id, target_frequency, name')
    .is('archived_at', null)
  
  const weekStart = '2025-09-08'
  const weekEnd = '2025-09-14'
  
  for (const habit of habits || []) {
    // Count SUCCESS entries only
    const { count: successes } = await supabase
      .from('habit_entries')
      .select('*', { count: 'exact', head: true })
      .eq('habit_id', habit.id)
      .eq('status', 'SUCCESS')
      .gte('date', weekStart)
      .lte('date', weekEnd)
    
    if (successes !== null && successes >= 0) {
      const isCompleted = successes >= habit.target_frequency
      const percentage = habit.target_frequency > 0 
        ? (successes / habit.target_frequency) * 100 
        : 0
      
      const { error } = await supabase
        .from('habit_weekly_summaries')
        .insert({
          habit_id: habit.id,
          user_id: habit.user_id,
          week_start: weekStart,
          successes: successes,
          target: habit.target_frequency,
          percentage: percentage,
          points_earned: isCompleted ? 0.5 : 0
        })
      
      if (!error) {
        const status = isCompleted ? '✓ COMPLETE' : `${successes}/${habit.target_frequency}`
        console.log(`   ${habit.user_id.substring(0,8)}: ${habit.name.padEnd(20)} ${status}`)
      }
    }
  }
  
  // Step 3: Recalculate all user points
  console.log('\n3. Recalculating all user points...')
  
  const { data: users } = await supabase
    .from('strava_connections')
    .select('user_id')
  
  for (const user of users || []) {
    // Exercise points
    const { data: activities } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', user.user_id)
      .gte('start_date', '2025-09-08')
      .lte('start_date', '2025-09-14T23:59:59')
      .is('deleted_at', null)
    
    const totalHours = activities?.reduce((sum, a) => sum + (a.moving_time / 3600), 0) || 0
    const exercisePoints = Math.min(totalHours, 10)
    
    // Habit points (first 5 completed habits)
    const { data: summaries } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target, points_earned')
      .eq('user_id', user.user_id)
      .eq('week_start', weekStart)
      .order('habit_id')
      .limit(5)
    
    const habitPoints = summaries?.reduce((sum, s) => sum + (s.points_earned || 0), 0) || 0
    
    // Badge points
    const { data: badges } = await supabase
      .from('user_badges')
      .select('tier')
      .eq('user_id', user.user_id)
    
    let badgePoints = 0
    badges?.forEach(b => {
      if (b.tier === 'gold') badgePoints += 10
      else if (b.tier === 'silver') badgePoints += 6
      else if (b.tier === 'bronze') badgePoints += 3
    })
    
    // Update points
    await supabase
      .from('user_points')
      .upsert({
        user_id: user.user_id,
        week_start: weekStart,
        week_end: weekEnd,
        exercise_points: exercisePoints,
        habit_points: habitPoints,
        badge_points: badgePoints,
        total_hours: totalHours,
        activities_count: activities?.length || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, week_start'
      })
    
    const total = exercisePoints + habitPoints + badgePoints
    console.log(`   ${user.user_id.substring(0,8)}: E=${exercisePoints.toFixed(1)}, H=${habitPoints}, B=${badgePoints}, Total=${total.toFixed(1)}`)
  }
  
  // Step 4: Show Gabriel's final state
  console.log('\n4. Gabriel\'s habits status:')
  const gabrielId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  
  const { data: gabrielHabits } = await supabase
    .from('habits')
    .select('id, name, target_frequency')
    .eq('user_id', gabrielId)
    .is('archived_at', null)
    .order('position')
  
  for (const habit of gabrielHabits || []) {
    const { count: successes } = await supabase
      .from('habit_entries')
      .select('*', { count: 'exact', head: true })
      .eq('habit_id', habit.id)
      .eq('status', 'SUCCESS')
      .gte('date', weekStart)
      .lte('date', weekEnd)
    
    const isComplete = successes >= habit.target_frequency
    const points = isComplete ? '+0.5' : '0'
    console.log(`   ${habit.name.padEnd(20)} ${successes}/${habit.target_frequency} ${isComplete ? '✓' : ' '} (${points} pts)`)
  }
  
  const { data: finalPoints } = await supabase
    .from('user_points')
    .select('exercise_points, habit_points, badge_points, total_points')
    .eq('user_id', gabrielId)
    .eq('week_start', weekStart)
    .single()
  
  console.log('\n5. Gabriel\'s final points:')
  console.log(`   Exercise: ${finalPoints?.exercise_points}`)
  console.log(`   Habits: ${finalPoints?.habit_points}`)
  console.log(`   Badges: ${finalPoints?.badge_points}`)
  console.log(`   TOTAL: ${finalPoints?.total_points}`)
  
  console.log('\n' + '=' .repeat(60))
  console.log('HABIT SYSTEM FIXED!')
  console.log('\nNOTE: The UI should now work correctly:')
  console.log('- Gray (NEUTRAL) = no entry')
  console.log('- Green (SUCCESS) = completed')
  console.log('- Red (FAILURE) = explicitly failed (counts as 0 for points)')
  console.log('=' .repeat(60))
}

fixHabitSystem().catch(console.error)