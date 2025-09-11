#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugHabitEntries() {
  console.log('=' .repeat(60))
  console.log('DEBUGGING HABIT ENTRIES')
  console.log('=' .repeat(60))
  
  const gabrielId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  const weekStart = '2025-09-08'
  const weekEnd = '2025-09-14'
  
  // Get Gabriel's habits
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, target_frequency')
    .eq('user_id', gabrielId)
    .is('archived_at', null)
    .order('position')
  
  console.log('\nGabriel\'s Habits:')
  for (const habit of habits || []) {
    console.log(`\nHabit: ${habit.name} (${habit.id})`)
    console.log(`Target: ${habit.target_frequency}/week`)
    
    // Get all entries for this habit this week
    const { data: entries } = await supabase
      .from('habit_entries')
      .select('date, status, created_at, updated_at')
      .eq('habit_id', habit.id)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date')
    
    if (entries && entries.length > 0) {
      console.log('Entries:')
      entries.forEach(e => {
        const created = new Date(e.created_at).toLocaleString()
        const updated = new Date(e.updated_at).toLocaleString()
        console.log(`  ${e.date}: ${e.status} (created: ${created}, updated: ${updated})`)
      })
    } else {
      console.log('  No entries this week')
    }
    
    // Get summary
    const { data: summary } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target, points_earned, updated_at')
      .eq('habit_id', habit.id)
      .eq('week_start', weekStart)
      .single()
    
    if (summary) {
      const updated = new Date(summary.updated_at).toLocaleString()
      console.log(`Summary: ${summary.successes}/${summary.target} = ${summary.points_earned} pts (updated: ${updated})`)
    } else {
      console.log('  No summary for this week')
    }
  }
  
  // Check for any entries without week_start
  console.log('\n' + '=' .repeat(60))
  console.log('CHECKING FOR DATA ISSUES:')
  
  const { data: orphaned } = await supabase
    .from('habit_entries')
    .select('habit_id, date, status')
    .is('week_start', null)
    .limit(10)
  
  if (orphaned && orphaned.length > 0) {
    console.log('\nOrphaned entries (no week_start):')
    orphaned.forEach(e => {
      console.log(`  ${e.date}: habit ${e.habit_id} - ${e.status}`)
    })
  } else {
    console.log('\n✓ No orphaned entries')
  }
  
  // Check for entries with wrong week_start
  const { data: allEntries } = await supabase
    .from('habit_entries')
    .select('date, week_start')
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .limit(100)
  
  let wrongWeekStart = 0
  allEntries?.forEach(e => {
    if (e.week_start !== weekStart) {
      wrongWeekStart++
    }
  })
  
  if (wrongWeekStart > 0) {
    console.log(`\n⚠️  ${wrongWeekStart} entries with wrong week_start`)
  } else {
    console.log('✓ All entries have correct week_start')
  }
  
  console.log('\n' + '=' .repeat(60))
}

debugHabitEntries().catch(console.error)