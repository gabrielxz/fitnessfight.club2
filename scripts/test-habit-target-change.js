#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testTargetChange() {
  console.log('=' .repeat(80))
  console.log('TESTING HABIT TARGET FREQUENCY CHANGE')
  console.log('=' .repeat(80))
  
  const gabrielId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  const yogaId = '5d6af519-92b4-4085-a62f-816e39cf7e05'
  const weekStart = '2025-09-08'
  const weekEnd = '2025-09-14'
  
  console.log('\n1. CURRENT STATE OF YOGA HABIT')
  console.log('=' .repeat(40))
  
  // Get current habit details
  const { data: habit } = await supabase
    .from('habits')
    .select('name, target_frequency')
    .eq('id', yogaId)
    .single()
  
  console.log(`Habit: ${habit.name}`)
  console.log(`Current target: ${habit.target_frequency} days/week`)
  
  // Count SUCCESS entries
  const { count: successes } = await supabase
    .from('habit_entries')
    .select('*', { count: 'exact', head: true })
    .eq('habit_id', yogaId)
    .eq('status', 'SUCCESS')
    .gte('date', weekStart)
    .lte('date', weekEnd)
  
  console.log(`SUCCESS entries this week: ${successes}`)
  
  // Get current summary
  const { data: summary } = await supabase
    .from('habit_weekly_summaries')
    .select('successes, target, points_earned')
    .eq('habit_id', yogaId)
    .eq('week_start', weekStart)
    .single()
  
  if (summary) {
    console.log(`Summary: ${summary.successes}/${summary.target} = ${summary.points_earned} pts`)
  }
  
  console.log('\n2. SIMULATING TARGET CHANGE')
  console.log('=' .repeat(40))
  
  // Test scenarios
  const scenarios = [
    { successes: 3, oldTarget: 4, newTarget: 3, expectedPoints: 0.5, description: '3/4 → 3/3 (incomplete → complete)' },
    { successes: 3, oldTarget: 3, newTarget: 4, expectedPoints: 0, description: '3/3 → 3/4 (complete → incomplete)' },
    { successes: 4, oldTarget: 4, newTarget: 5, expectedPoints: 0, description: '4/4 → 4/5 (complete → incomplete)' },
    { successes: 5, oldTarget: 7, newTarget: 5, expectedPoints: 0.5, description: '5/7 → 5/5 (incomplete → complete)' },
  ]
  
  console.log('Scenarios to test:')
  scenarios.forEach(s => {
    console.log(`  ${s.description}: should be ${s.expectedPoints} pts`)
  })
  
  console.log('\n3. YOUR SPECIFIC CASE')
  console.log('=' .repeat(40))
  
  const currentSuccesses = successes || 0
  const currentTarget = habit.target_frequency
  
  console.log(`Current: ${currentSuccesses}/${currentTarget}`)
  
  // Test changing to different targets
  for (const newTarget of [3, 4, 5, 6, 7]) {
    const wouldBeComplete = currentSuccesses >= newTarget
    const points = wouldBeComplete ? 0.5 : 0
    const status = wouldBeComplete ? 'COMPLETE' : 'INCOMPLETE'
    
    console.log(`  If changed to ${newTarget}: ${currentSuccesses}/${newTarget} = ${points} pts (${status})`)
  }
  
  console.log('\n4. CHECKING ALL HABITS FOR EDGE CASES')
  console.log('=' .repeat(40))
  
  // Get all of Gabriel's habits
  const { data: allHabits } = await supabase
    .from('habits')
    .select('id, name, target_frequency')
    .eq('user_id', gabrielId)
    .is('archived_at', null)
    .order('position')
  
  for (const h of allHabits || []) {
    // Count successes
    const { count } = await supabase
      .from('habit_entries')
      .select('*', { count: 'exact', head: true })
      .eq('habit_id', h.id)
      .eq('status', 'SUCCESS')
      .gte('date', weekStart)
      .lte('date', weekEnd)
    
    const successes = count || 0
    const isComplete = successes >= h.target_frequency
    const points = isComplete ? 0.5 : 0
    
    console.log(`${h.name.padEnd(20)} ${successes}/${h.target_frequency} = ${points} pts`)
    
    // Show what would happen with different targets
    if (successes > 0) {
      const criticalTarget = successes // Target that makes it exactly complete
      const aboveTarget = successes - 1 // Target that keeps it complete
      const belowTarget = successes + 1 // Target that makes it incomplete
      
      if (h.target_frequency !== criticalTarget) {
        console.log(`  → If target=${criticalTarget}: would be ${successes}/${criticalTarget} = 0.5 pts`)
      }
      if (aboveTarget > 0 && h.target_frequency !== aboveTarget) {
        console.log(`  → If target=${aboveTarget}: would be ${successes}/${aboveTarget} = 0.5 pts`)
      }
      if (belowTarget <= 7 && h.target_frequency !== belowTarget) {
        console.log(`  → If target=${belowTarget}: would be ${successes}/${belowTarget} = 0 pts`)
      }
    }
  }
  
  console.log('\n' + '=' .repeat(80))
  console.log('TEST COMPLETE')
  console.log('\nREMINDER: When you change a habit target in the UI:')
  console.log('1. The summary should update immediately')
  console.log('2. Points should recalculate based on new target')
  console.log('3. The UI should reflect the new completion status')
  console.log('=' .repeat(80))
}

testTargetChange().catch(console.error)