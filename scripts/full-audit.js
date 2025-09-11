#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fullAudit() {
  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce' // Gabriel
  
  console.log('=' .repeat(60))
  console.log('FULL AUDIT FOR USER:', userId)
  console.log('=' .repeat(60))
  
  // 1. Current points record
  console.log('\n1. CURRENT POINTS RECORD:')
  const { data: points } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', '2025-09-08')
    .single()
  
  if (points) {
    console.log('  Exercise points:', points.exercise_points)
    console.log('  Habit points:', points.habit_points)
    console.log('  Badge points:', points.badge_points)
    console.log('  Total points:', points.total_points)
    console.log('  Last updated:', points.updated_at)
  } else {
    console.log('  NO POINTS RECORD FOUND!')
  }
  
  // 2. Badges
  console.log('\n2. BADGES:')
  const { data: badges } = await supabase
    .from('user_badges')
    .select('tier, badge:badges(name, emoji)')
    .eq('user_id', userId)
  
  let expectedBadgePoints = 0
  if (badges && badges.length > 0) {
    badges.forEach(b => {
      const points = b.tier === 'gold' ? 10 : b.tier === 'silver' ? 6 : 3
      expectedBadgePoints += points
      console.log(`  ${b.badge.emoji} ${b.badge.name} (${b.tier}): ${points} pts`)
    })
    console.log(`  TOTAL BADGE POINTS EXPECTED: ${expectedBadgePoints}`)
  } else {
    console.log('  NO BADGES FOUND!')
  }
  
  // 3. Habits
  console.log('\n3. HABITS:')
  const { data: habits } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('position')
  
  for (const habit of habits || []) {
    console.log(`\n  ${habit.name} (ID: ${habit.id}):`)
    console.log(`    Target: ${habit.target_frequency}/week`)
    
    // Get all entries for this week
    const { data: entries } = await supabase
      .from('habit_entries')
      .select('*')
      .eq('habit_id', habit.id)
      .gte('date', '2025-09-08')
      .lte('date', '2025-09-14')
      .order('date')
    
    console.log(`    Entries (${entries?.length || 0}):`)
    entries?.forEach(e => {
      console.log(`      ${e.date}: ${e.status} (week_start: ${e.week_start})`)
    })
    
    const successes = entries?.filter(e => e.status === 'SUCCESS').length || 0
    console.log(`    Success count: ${successes}/${habit.target_frequency}`)
    
    // Check weekly summary
    const { data: summary } = await supabase
      .from('habit_weekly_summaries')
      .select('*')
      .eq('habit_id', habit.id)
      .eq('week_start', '2025-09-08')
      .single()
    
    if (summary) {
      console.log(`    Summary: ${summary.successes}/${summary.target} (${summary.percentage}%)`)
      if (summary.successes !== successes) {
        console.log(`    ⚠️ MISMATCH: Summary says ${summary.successes} but actual is ${successes}`)
      }
    } else {
      console.log(`    ⚠️ NO SUMMARY FOUND`)
    }
  }
  
  // 4. Expected vs Actual
  console.log('\n4. EXPECTED POINTS CALCULATION:')
  
  // Exercise
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('moving_time')
    .eq('user_id', userId)
    .gte('start_date', '2025-09-08')
    .lte('start_date', '2025-09-14T23:59:59')
    .is('deleted_at', null)
  
  const totalHours = activities?.reduce((sum, a) => sum + (a.moving_time / 3600), 0) || 0
  const exercisePoints = Math.min(totalHours, 10)
  console.log(`  Exercise: ${exercisePoints.toFixed(2)} (${totalHours.toFixed(2)} hours)`)
  
  // Habits (only first 5 completed)
  const { data: allSummaries } = await supabase
    .from('habit_weekly_summaries')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', '2025-09-08')
    .order('habit_id')
    .limit(5)
  
  const completedHabits = allSummaries?.filter(s => s.successes >= s.target) || []
  const habitPoints = completedHabits.length * 0.5
  console.log(`  Habits: ${habitPoints} (${completedHabits.length} completed)`)
  completedHabits.forEach(h => {
    console.log(`    - Habit ${h.habit_id}: ${h.successes}/${h.target}`)
  })
  
  console.log(`  Badges: ${expectedBadgePoints}`)
  console.log(`  TOTAL EXPECTED: ${(exercisePoints + habitPoints + expectedBadgePoints).toFixed(2)}`)
  
  console.log('\n5. ISSUES DETECTED:')
  const issues = []
  
  if (points?.badge_points !== expectedBadgePoints) {
    issues.push(`Badge points mismatch: DB has ${points?.badge_points}, should be ${expectedBadgePoints}`)
  }
  
  if (points?.habit_points !== habitPoints) {
    issues.push(`Habit points mismatch: DB has ${points?.habit_points}, should be ${habitPoints}`)
  }
  
  if (points?.exercise_points?.toFixed(2) !== exercisePoints.toFixed(2)) {
    issues.push(`Exercise points mismatch: DB has ${points?.exercise_points}, should be ${exercisePoints.toFixed(2)}`)
  }
  
  if (issues.length > 0) {
    issues.forEach(i => console.log(`  ⚠️ ${i}`))
  } else {
    console.log('  ✓ No issues detected')
  }
  
  console.log('\n' + '=' .repeat(60))
}

fullAudit().catch(console.error)