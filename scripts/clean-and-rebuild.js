#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function cleanAndRebuild() {
  console.log('=' .repeat(60))
  console.log('CLEANING AND REBUILDING ALL DATA')
  console.log('=' .repeat(60))
  
  // Step 1: Delete ALL habit summaries - they're stale
  console.log('\n1. Deleting all habit weekly summaries...')
  const { error: deleteError } = await supabase
    .from('habit_weekly_summaries')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
  
  if (deleteError) {
    console.error('Error deleting summaries:', deleteError)
  } else {
    console.log('   ✓ All summaries deleted')
  }
  
  // Step 2: Rebuild summaries from actual entries
  console.log('\n2. Rebuilding summaries from habit entries...')
  
  // Get all habits
  const { data: habits } = await supabase
    .from('habits')
    .select('id, user_id, target_frequency, name')
    .is('archived_at', null)
  
  for (const habit of habits || []) {
    // Count SUCCESS entries for this week
    const { count: successes } = await supabase
      .from('habit_entries')
      .select('*', { count: 'exact', head: true })
      .eq('habit_id', habit.id)
      .eq('status', 'SUCCESS')
      .gte('date', '2025-09-08')
      .lte('date', '2025-09-14')
    
    if (successes > 0) {
      const percentage = (successes / habit.target_frequency) * 100
      
      const { error } = await supabase
        .from('habit_weekly_summaries')
        .insert({
          habit_id: habit.id,
          user_id: habit.user_id,
          week_start: '2025-09-08',
          successes: successes,
          target: habit.target_frequency,
          percentage: percentage,
          points_earned: successes >= habit.target_frequency ? 0.5 : 0
        })
      
      if (!error) {
        console.log(`   ✓ ${habit.user_id.substring(0,8)}: ${habit.name} - ${successes}/${habit.target_frequency}`)
      }
    }
  }
  
  // Step 3: Recalculate all points with correct badge calculation
  console.log('\n3. Recalculating all points...')
  
  // Get all users
  const { data: users } = await supabase
    .from('strava_connections')
    .select('user_id')
  
  for (const user of users || []) {
    // Calculate exercise points
    const { data: activities } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', user.user_id)
      .gte('start_date', '2025-09-08')
      .lte('start_date', '2025-09-14T23:59:59')
      .is('deleted_at', null)
    
    const totalHours = activities?.reduce((sum, a) => sum + (a.moving_time / 3600), 0) || 0
    const exercisePoints = Math.min(totalHours, 10)
    
    // Calculate habit points (first 5 completed)
    const { data: summaries } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target')
      .eq('user_id', user.user_id)
      .eq('week_start', '2025-09-08')
      .order('habit_id')
      .limit(5)
    
    const completedHabits = summaries?.filter(s => s.successes >= s.target).length || 0
    const habitPoints = completedHabits * 0.5
    
    // Calculate badge points
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
    
    // Update points record
    const { error } = await supabase
      .from('user_points')
      .upsert({
        user_id: user.user_id,
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
      console.log(`   ✓ ${user.user_id.substring(0,8)}: E=${exercisePoints.toFixed(1)}, H=${habitPoints}, B=${badgePoints}, Total=${total.toFixed(1)}`)
    }
  }
  
  // Step 4: Show Gabriel's final state
  console.log('\n4. Final state for Gabriel:')
  const gabrielId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  
  const { data: finalPoints } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', gabrielId)
    .eq('week_start', '2025-09-08')
    .single()
  
  if (finalPoints) {
    console.log(`   Exercise: ${finalPoints.exercise_points}`)
    console.log(`   Habits: ${finalPoints.habit_points}`)
    console.log(`   Badges: ${finalPoints.badge_points}`)
    console.log(`   TOTAL: ${finalPoints.total_points}`)
  }
  
  console.log('\n' + '=' .repeat(60))
  console.log('DONE! Everything has been cleaned and rebuilt.')
  console.log('=' .repeat(60))
}

cleanAndRebuild().catch(console.error)