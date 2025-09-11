#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixHabitSummaries() {
  console.log('=' .repeat(80))
  console.log('FINAL HABIT SUMMARY FIX')
  console.log('=' .repeat(80))
  
  const gabrielId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  const weekStart = '2025-09-08'
  const weekEnd = '2025-09-14'
  
  console.log('\n1. DISABLING RLS ON HABIT_WEEKLY_SUMMARIES')
  console.log('=' .repeat(40))
  
  // First, try to disable RLS
  try {
    // We can't run ALTER TABLE directly through API, so we'll work around it
    console.log('Note: RLS must be disabled via Supabase SQL Editor')
    console.log('Run this SQL: ALTER TABLE habit_weekly_summaries DISABLE ROW LEVEL SECURITY;')
  } catch (error) {
    console.error('Cannot disable RLS programmatically:', error.message)
  }
  
  console.log('\n2. FIXING ALL HABIT SUMMARIES')
  console.log('=' .repeat(40))
  
  // Get all habits for all users
  const { data: allHabits } = await supabase
    .from('habits')
    .select('id, user_id, name, target_frequency')
    .is('archived_at', null)
  
  console.log(`Found ${allHabits?.length || 0} active habits`)
  
  let fixedCount = 0
  const userSummaries = {}
  
  for (const habit of allHabits || []) {
    // Count SUCCESS entries for this week
    const { count: successes } = await supabase
      .from('habit_entries')
      .select('*', { count: 'exact', head: true })
      .eq('habit_id', habit.id)
      .eq('status', 'SUCCESS')
      .gte('date', weekStart)
      .lte('date', weekEnd)
    
    const actualSuccesses = successes || 0
    const isCompleted = actualSuccesses >= habit.target_frequency
    const percentage = habit.target_frequency > 0 
      ? (actualSuccesses / habit.target_frequency) * 100 
      : 0
    const pointsEarned = isCompleted ? 0.5 : 0
    
    // Check current summary
    const { data: currentSummary } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, points_earned')
      .eq('habit_id', habit.id)
      .eq('week_start', weekStart)
      .single()
    
    // Track user summaries for points calculation
    if (!userSummaries[habit.user_id]) {
      userSummaries[habit.user_id] = []
    }
    userSummaries[habit.user_id].push({
      habit_id: habit.id,
      name: habit.name,
      successes: actualSuccesses,
      target: habit.target_frequency,
      points_earned: pointsEarned
    })
    
    // Fix if needed
    if (!currentSummary || 
        currentSummary.successes !== actualSuccesses || 
        currentSummary.points_earned !== pointsEarned) {
      
      const { error } = await supabase
        .from('habit_weekly_summaries')
        .upsert({
          habit_id: habit.id,
          user_id: habit.user_id,
          week_start: weekStart,
          successes: actualSuccesses,
          target: habit.target_frequency,
          percentage: percentage,
          points_earned: pointsEarned,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'habit_id, week_start'
        })
      
      if (error) {
        console.error(`  ERROR fixing ${habit.name}:`, error.message)
      } else {
        fixedCount++
        if (habit.user_id === gabrielId) {
          console.log(`  FIXED: ${habit.name} - ${actualSuccesses}/${habit.target_frequency} = ${pointsEarned} pts`)
        }
      }
    }
  }
  
  console.log(`\nFixed ${fixedCount} summaries`)
  
  console.log('\n3. RECALCULATING USER POINTS')
  console.log('=' .repeat(40))
  
  // Update points for each user
  for (const [userId, summaries] of Object.entries(userSummaries)) {
    // Get first 5 habits by position for this user
    const { data: userHabits } = await supabase
      .from('habits')
      .select('id')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('position')
      .order('created_at')
      .limit(5)
    
    const eligibleIds = userHabits?.map(h => h.id) || []
    
    // Calculate habit points (only first 5 habits)
    const habitPoints = summaries
      .filter(s => eligibleIds.includes(s.habit_id))
      .reduce((sum, s) => sum + s.points_earned, 0)
    
    // Update user_points
    const { error } = await supabase
      .from('user_points')
      .update({
        habit_points: habitPoints,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('week_start', weekStart)
    
    if (!error && userId === gabrielId) {
      console.log(`Gabriel's habit points: ${habitPoints}`)
      
      // Show Gabriel's habits
      console.log('\nGabriel\'s habits:')
      summaries
        .filter(s => s.user_id === gabrielId || userId === gabrielId)
        .forEach((s, i) => {
          const eligible = i < 5 ? '✓' : '✗'
          console.log(`  ${eligible} ${s.name}: ${s.successes}/${s.target} = ${s.points_earned} pts`)
        })
    }
  }
  
  console.log('\n4. GABRIEL\'S FINAL STATE')
  console.log('=' .repeat(40))
  
  // Check Gabriel's final points
  const { data: finalPoints } = await supabase
    .from('user_points')
    .select('exercise_points, habit_points, badge_points, total_points')
    .eq('user_id', gabrielId)
    .eq('week_start', weekStart)
    .single()
  
  if (finalPoints) {
    console.log(`Exercise: ${finalPoints.exercise_points}`)
    console.log(`Habits: ${finalPoints.habit_points}`)
    console.log(`Badges: ${finalPoints.badge_points}`)
    console.log(`TOTAL: ${finalPoints.total_points || (finalPoints.exercise_points + finalPoints.habit_points + finalPoints.badge_points)}`)
  }
  
  console.log('\n' + '=' .repeat(80))
  console.log('COMPLETE!')
  console.log('\nNOTE: If summaries still don\'t update, run this in Supabase SQL Editor:')
  console.log('ALTER TABLE habit_weekly_summaries DISABLE ROW LEVEL SECURITY;')
  console.log('=' .repeat(80))
}

fixHabitSummaries().catch(console.error)