#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugPointsFlow() {
  console.log('=' .repeat(80))
  console.log('DEBUGGING POINTS CALCULATION FLOW')
  console.log('=' .repeat(80))
  
  const gabrielId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  const yogaId = '5d6af519-92b4-4085-a62f-816e39cf7e05'
  const weekStart = '2025-09-08'
  const weekEnd = '2025-09-14'
  
  console.log('\n1. YOGA HABIT ENTRIES:')
  console.log('=' .repeat(40))
  
  const { data: entries } = await supabase
    .from('habit_entries')
    .select('*')
    .eq('habit_id', yogaId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('date')
  
  console.log('Raw entries from habit_entries table:')
  entries?.forEach(e => {
    console.log(`  ${e.date}: ${e.status} (week_start: ${e.week_start}, id: ${e.id})`)
  })
  
  const successCount = entries?.filter(e => e.status === 'SUCCESS').length || 0
  console.log(`\nTotal SUCCESS entries: ${successCount}`)
  
  console.log('\n2. YOGA HABIT SUMMARY:')
  console.log('=' .repeat(40))
  
  const { data: summary } = await supabase
    .from('habit_weekly_summaries')
    .select('*')
    .eq('habit_id', yogaId)
    .eq('week_start', weekStart)
    .single()
  
  if (summary) {
    console.log(`Successes: ${summary.successes}/${summary.target}`)
    console.log(`Points earned: ${summary.points_earned}`)
    console.log(`Percentage: ${summary.percentage}%`)
    console.log(`Last updated: ${new Date(summary.updated_at).toLocaleString()}`)
    console.log(`Raw summary record:`, JSON.stringify(summary, null, 2))
  } else {
    console.log('No summary found!')
  }
  
  console.log('\n3. FIRST 5 HABITS (eligible for points):')
  console.log('=' .repeat(40))
  
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, position, target_frequency')
    .eq('user_id', gabrielId)
    .is('archived_at', null)
    .order('position')
    .order('created_at')
    .limit(5)
  
  habits?.forEach((h, i) => {
    const isYoga = h.id === yogaId
    console.log(`${i+1}. ${h.name} ${isYoga ? '(YOGA)' : ''} - Position: ${h.position}, Target: ${h.target_frequency}`)
  })
  
  console.log('\n4. ALL HABIT SUMMARIES FOR THIS WEEK:')
  console.log('=' .repeat(40))
  
  const { data: allSummaries } = await supabase
    .from('habit_weekly_summaries')
    .select('habit_id, successes, target, points_earned')
    .eq('user_id', gabrielId)
    .eq('week_start', weekStart)
  
  let totalHabitPoints = 0
  for (const s of allSummaries || []) {
    const habit = habits?.find(h => h.id === s.habit_id)
    const isEligible = habits?.slice(0, 5).some(h => h.id === s.habit_id)
    const points = isEligible ? s.points_earned : 0
    totalHabitPoints += points
    console.log(`  ${habit?.name || s.habit_id}: ${s.successes}/${s.target} = ${s.points_earned} pts ${isEligible ? '(counts)' : '(not eligible)'}`)
  }
  console.log(`\nTotal habit points (first 5 only): ${totalHabitPoints}`)
  
  console.log('\n5. USER_POINTS TABLE:')
  console.log('=' .repeat(40))
  
  const { data: userPoints } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', gabrielId)
    .eq('week_start', weekStart)
    .single()
  
  if (userPoints) {
    console.log(`Exercise points: ${userPoints.exercise_points}`)
    console.log(`Habit points: ${userPoints.habit_points}`)
    console.log(`Badge points: ${userPoints.badge_points}`)
    console.log(`Total points: ${userPoints.total_points || (userPoints.exercise_points + userPoints.habit_points + userPoints.badge_points)}`)
    console.log(`Last updated: ${new Date(userPoints.updated_at).toLocaleString()}`)
  } else {
    console.log('No user_points record found!')
  }
  
  console.log('\n6. TESTING MANUAL RECALCULATION:')
  console.log('=' .repeat(40))
  
  // Count SUCCESS entries manually
  const { count: manualCount } = await supabase
    .from('habit_entries')
    .select('*', { count: 'exact', head: true })
    .eq('habit_id', yogaId)
    .eq('status', 'SUCCESS')
    .gte('date', weekStart)
    .lte('date', weekEnd)
  
  console.log(`Manual count of SUCCESS entries: ${manualCount}`)
  console.log(`Should Yoga be complete? ${manualCount >= 4 ? 'YES' : 'NO'}`)
  console.log(`Expected points: ${manualCount >= 4 ? '0.5' : '0'}`)
  
  console.log('\n' + '=' .repeat(80))
  console.log('END DEBUG REPORT')
  console.log('=' .repeat(80))
}

debugPointsFlow().catch(console.error)