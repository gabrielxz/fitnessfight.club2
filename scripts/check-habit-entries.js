#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkHabitEntries() {
  const userId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  
  console.log('Checking habit entries for this week...')
  console.log('=' .repeat(50))
  
  // Get all habits
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, target_frequency')
    .eq('user_id', userId)
    .is('archived_at', null)
  
  for (const habit of habits || []) {
    console.log(`\n${habit.name} (Target: ${habit.target_frequency}/week):`)
    
    // Get entries for this week
    const { data: entries } = await supabase
      .from('habit_entries')
      .select('date, status')
      .eq('habit_id', habit.id)
      .gte('date', '2025-09-08')
      .lte('date', '2025-09-14')
      .order('date')
    
    if (entries && entries.length > 0) {
      entries.forEach(e => {
        console.log(`  ${e.date}: ${e.status}`)
      })
      const successes = entries.filter(e => e.status === 'SUCCESS').length
      console.log(`  Total successes: ${successes}/${habit.target_frequency}`)
      if (successes >= habit.target_frequency) {
        console.log(`  ✓ COMPLETED - Should earn 0.5 points`)
      }
    } else {
      console.log(`  No entries this week`)
    }
    
    // Check weekly summary
    const { data: summary } = await supabase
      .from('habit_weekly_summaries')
      .select('*')
      .eq('habit_id', habit.id)
      .eq('week_start', '2025-09-08')
      .single()
    
    if (summary) {
      console.log(`  Summary: ${summary.successes}/${summary.target} (${summary.percentage}%)`)
    } else {
      console.log(`  No weekly summary found`)
    }
  }
  
  // Count habits that should earn points (first 5 completed habits)
  console.log('\n' + '=' .repeat(50))
  console.log('Checking which habits should earn points...')
  
  const { data: summaries } = await supabase
    .from('habit_weekly_summaries')
    .select('habit_id, successes, target')
    .eq('user_id', userId)
    .eq('week_start', '2025-09-08')
    .order('habit_id')
    .limit(5)
  
  let completedCount = 0
  summaries?.forEach(s => {
    if (s.successes >= s.target) {
      completedCount++
      console.log(`Habit ${s.habit_id}: COMPLETED (${s.successes}/${s.target})`)
    }
  })
  
  console.log(`\nTotal completed habits (first 5): ${completedCount}`)
  console.log(`Expected habit points: ${completedCount * 0.5}`)
}

checkHabitEntries().catch(console.error)