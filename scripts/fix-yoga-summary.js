#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixYogaSummary() {
  console.log('Fixing Yoga summary...\n')
  
  const yogaId = '5d6af519-92b4-4085-a62f-816e39cf7e05'
  const gabrielId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  const weekStart = '2025-09-08'
  const weekEnd = '2025-09-14'
  
  // Count actual SUCCESS entries
  const { count: successes } = await supabase
    .from('habit_entries')
    .select('*', { count: 'exact', head: true })
    .eq('habit_id', yogaId)
    .eq('status', 'SUCCESS')
    .gte('date', weekStart)
    .lte('date', weekEnd)
  
  console.log(`Found ${successes} SUCCESS entries for Yoga`)
  
  // Update the summary
  const isCompleted = successes >= 4
  const percentage = (successes / 4) * 100
  const pointsEarned = isCompleted ? 0.5 : 0
  
  const { error } = await supabase
    .from('habit_weekly_summaries')
    .upsert({
      user_id: gabrielId,
      habit_id: yogaId,
      week_start: weekStart,
      successes: successes,
      target: 4,
      percentage: percentage,
      points_earned: pointsEarned,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'habit_id, week_start'
    })
  
  if (error) {
    console.error('Error updating summary:', error)
  } else {
    console.log(`Updated summary: ${successes}/4 = ${pointsEarned} points`)
  }
  
  // Now recalculate total points
  console.log('\nRecalculating total points...')
  
  // Get first 5 habits by position
  const { data: habits } = await supabase
    .from('habits')
    .select('id')
    .eq('user_id', gabrielId)
    .is('archived_at', null)
    .order('position')
    .order('created_at')
    .limit(5)
  
  const eligibleHabitIds = habits?.map(h => h.id) || []
  
  // Get summaries for eligible habits
  const { data: summaries } = await supabase
    .from('habit_weekly_summaries')
    .select('points_earned')
    .eq('user_id', gabrielId)
    .eq('week_start', weekStart)
    .in('habit_id', eligibleHabitIds)
  
  const habitPoints = summaries?.reduce((sum, s) => sum + (s.points_earned || 0), 0) || 0
  console.log(`Total habit points: ${habitPoints}`)
  
  // Update user_points
  const { data: currentPoints } = await supabase
    .from('user_points')
    .select('exercise_points, badge_points')
    .eq('user_id', gabrielId)
    .eq('week_start', weekStart)
    .single()
  
  if (currentPoints) {
    const { error: updateError } = await supabase
      .from('user_points')
      .update({
        habit_points: habitPoints,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', gabrielId)
      .eq('week_start', weekStart)
    
    if (!updateError) {
      const total = currentPoints.exercise_points + habitPoints + currentPoints.badge_points
      console.log(`Updated total points: ${total.toFixed(2)}`)
    }
  }
  
  console.log('\nDone!')
}

fixYogaSummary().catch(console.error)