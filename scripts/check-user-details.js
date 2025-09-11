#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkUserDetails() {
  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce' // Gabriel's user ID
  
  console.log('Checking details for user:', userId)
  console.log('=' .repeat(50))
  
  // 1. Check current points record
  const { data: points } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', '2025-09-08')
    .single()
  
  console.log('\nCurrent points record:')
  console.log(`  Exercise: ${points?.exercise_points || 0}`)
  console.log(`  Habit: ${points?.habit_points || 0}`)
  console.log(`  Badge: ${points?.badge_points || 0}`)
  console.log(`  Total: ${points?.total_points || 0}`)
  
  // 2. Check badges
  const { data: badges } = await supabase
    .from('user_badges')
    .select('tier, badge:badges(name, emoji)')
    .eq('user_id', userId)
  
  console.log('\nBadges earned:')
  let expectedBadgePoints = 0
  badges?.forEach(b => {
    const badgeInfo = b.badge
    const points = b.tier === 'gold' ? 10 : b.tier === 'silver' ? 6 : 3
    expectedBadgePoints += points
    console.log(`  ${badgeInfo.emoji} ${badgeInfo.name} (${b.tier}): ${points} points`)
  })
  console.log(`  Total expected badge points: ${expectedBadgePoints}`)
  
  // 3. Check habits
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, target_frequency')
    .eq('user_id', userId)
    .is('archived_at', null)
  
  console.log('\nHabits:')
  let expectedHabitPoints = 0
  
  for (const habit of habits || []) {
    // Check this week's summary
    const { data: summary } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target')
      .eq('habit_id', habit.id)
      .eq('week_start', '2025-09-08')
      .single()
    
    const completed = summary && summary.successes >= summary.target
    if (completed) {
      expectedHabitPoints += 0.5
      console.log(`  ✓ ${habit.name}: ${summary.successes}/${summary.target} - COMPLETED (+0.5 points)`)
    } else {
      console.log(`  ✗ ${habit.name}: ${summary?.successes || 0}/${habit.target_frequency}`)
    }
  }
  console.log(`  Total expected habit points: ${expectedHabitPoints}`)
  
  // 4. Check activities
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('moving_time')
    .eq('user_id', userId)
    .gte('start_date', '2025-09-08')
    .lte('start_date', '2025-09-14T23:59:59')
    .is('deleted_at', null)
  
  const totalHours = activities?.reduce((sum, a) => sum + (a.moving_time / 3600), 0) || 0
  const exercisePoints = Math.min(totalHours, 10)
  
  console.log('\nExercise:')
  console.log(`  Activities: ${activities?.length || 0}`)
  console.log(`  Total hours: ${totalHours.toFixed(2)}`)
  console.log(`  Exercise points (capped at 10): ${exercisePoints.toFixed(2)}`)
  
  // Summary
  console.log('\n' + '=' .repeat(50))
  console.log('EXPECTED TOTALS:')
  console.log(`  Exercise: ${exercisePoints.toFixed(2)}`)
  console.log(`  Badges: ${expectedBadgePoints}`)
  console.log(`  Habits: ${expectedHabitPoints}`)
  console.log(`  TOTAL: ${(exercisePoints + expectedBadgePoints + expectedHabitPoints).toFixed(2)}`)
  
  console.log('\nACTUAL IN DATABASE:')
  console.log(`  Total: ${points?.total_points || 0}`)
  
  if (Math.abs((points?.total_points || 0) - (exercisePoints + expectedBadgePoints + expectedHabitPoints)) > 0.01) {
    console.log('\n⚠️  MISMATCH DETECTED! Points need recalculation.')
  }
}

checkUserDetails().catch(console.error)