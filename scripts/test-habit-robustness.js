#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testHabitRobustness() {
  console.log('=' .repeat(60))
  console.log('TESTING HABIT SYSTEM ROBUSTNESS')
  console.log('=' .repeat(60))
  
  // Check multiple weeks
  const weeks = [
    { start: '2025-09-01', end: '2025-09-07', label: 'Last week' },
    { start: '2025-09-08', end: '2025-09-14', label: 'This week' },
    { start: '2025-09-15', end: '2025-09-21', label: 'Next week' }
  ]
  
  console.log('\n1. CHECKING HABIT DATA ACROSS WEEKS:')
  
  for (const week of weeks) {
    console.log(`\n${week.label} (${week.start} to ${week.end}):`)
    
    // Check entries
    const { data: entries, count } = await supabase
      .from('habit_entries')
      .select('habit_id, date, status', { count: 'exact' })
      .gte('date', week.start)
      .lte('date', week.end)
      .order('date')
    
    console.log(`  Total entries: ${count || 0}`)
    
    // Check summaries
    const { data: summaries } = await supabase
      .from('habit_weekly_summaries')
      .select('user_id, habit_id, successes, target, points_earned')
      .eq('week_start', week.start)
    
    if (summaries && summaries.length > 0) {
      console.log(`  Summaries: ${summaries.length}`)
      const totalPoints = summaries.reduce((sum, s) => sum + (s.points_earned || 0), 0)
      console.log(`  Total habit points earned: ${totalPoints}`)
    } else {
      console.log(`  No summaries for this week`)
    }
    
    // Check user_points
    const { data: points } = await supabase
      .from('user_points')
      .select('user_id, habit_points')
      .eq('week_start', week.start)
    
    if (points && points.length > 0) {
      const totalHabitPoints = points.reduce((sum, p) => sum + (p.habit_points || 0), 0)
      console.log(`  Total habit points in user_points: ${totalHabitPoints}`)
    }
  }
  
  console.log('\n2. CHECKING DATA INTEGRITY:')
  
  // Check for orphaned entries (entries without week_start)
  const { count: orphanedCount } = await supabase
    .from('habit_entries')
    .select('*', { count: 'exact', head: true })
    .is('week_start', null)
  
  console.log(`  Orphaned entries (no week_start): ${orphanedCount || 0}`)
  
  // Check for mismatched week_start values
  const { data: mismatchedEntries } = await supabase
    .from('habit_entries')
    .select('date, week_start')
    .limit(100)
  
  let mismatches = 0
  mismatchedEntries?.forEach(entry => {
    const expectedWeekStart = getWeekStart(new Date(entry.date))
    if (entry.week_start !== expectedWeekStart) {
      mismatches++
    }
  })
  console.log(`  Entries with incorrect week_start: ${mismatches}`)
  
  // Check summaries without corresponding entries
  const { data: allSummaries } = await supabase
    .from('habit_weekly_summaries')
    .select('habit_id, week_start, successes')
    .gt('successes', 0)
  
  let orphanedSummaries = 0
  for (const summary of allSummaries || []) {
    const { count } = await supabase
      .from('habit_entries')
      .select('*', { count: 'exact', head: true })
      .eq('habit_id', summary.habit_id)
      .eq('status', 'SUCCESS')
      .gte('date', summary.week_start)
      .lte('date', new Date(new Date(summary.week_start).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    
    if (count !== summary.successes) {
      orphanedSummaries++
    }
  }
  console.log(`  Summaries with mismatched counts: ${orphanedSummaries}`)
  
  console.log('\n3. TESTING POINTS PERSISTENCE:')
  
  // Check if habit points are preserved in user_points across weeks
  const { data: historicalPoints } = await supabase
    .from('user_points')
    .select('week_start, user_id, habit_points, total_points')
    .gt('habit_points', 0)
    .order('week_start')
  
  if (historicalPoints && historicalPoints.length > 0) {
    console.log('  Weeks with habit points:')
    const weekTotals = {}
    historicalPoints.forEach(p => {
      if (!weekTotals[p.week_start]) {
        weekTotals[p.week_start] = 0
      }
      weekTotals[p.week_start] += p.habit_points
    })
    
    Object.entries(weekTotals).forEach(([week, total]) => {
      console.log(`    ${week}: ${total} habit points`)
    })
  } else {
    console.log('  No historical habit points found')
  }
  
  console.log('\n' + '=' .repeat(60))
  console.log('ROBUSTNESS CHECK COMPLETE')
  console.log('=' .repeat(60))
}

function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getUTCDay()
  const adjustedDay = day === 0 ? 7 : day
  const diff = d.getUTCDate() - (adjustedDay - 1)
  const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
  return weekStart.toISOString().split('T')[0]
}

testHabitRobustness().catch(console.error)