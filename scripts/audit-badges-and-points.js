#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function auditBadgesAndPoints() {
  console.log('=' .repeat(80))
  console.log('BADGE AND POINTS AUDIT')
  console.log('=' .repeat(80))
  
  const gabrielId = '6ff52889-f6b0-4403-8a48-3f7e4b2195ce'
  const weekStart = '2025-09-08'
  
  console.log('\n1. GABRIEL\'S BADGES')
  console.log('=' .repeat(40))
  
  // Get all of Gabriel's badges
  const { data: badges } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', gabrielId)
    .order('earned_at', { ascending: false })
  
  let expectedBadgePoints = 0
  
  if (badges && badges.length > 0) {
    console.log(`Found ${badges.length} badges:`)
    badges.forEach(badge => {
      let points = 0
      if (badge.tier === 'gold') points = 10
      else if (badge.tier === 'silver') points = 6
      else if (badge.tier === 'bronze') points = 3
      
      expectedBadgePoints += points
      
      const earnedDate = new Date(badge.earned_at).toLocaleDateString()
      const tier = (badge.tier || 'unknown').padEnd(6)
      const name = (badge.badge_name || badge.name || 'unnamed').padEnd(30)
      console.log(`  ${tier} - ${name} = ${points} pts (earned: ${earnedDate})`)
    })
  } else {
    console.log('No badges found')
  }
  
  console.log(`\nExpected total badge points: ${expectedBadgePoints}`)
  
  console.log('\n2. USER_POINTS TABLE')
  console.log('=' .repeat(40))
  
  // Get current points from user_points
  const { data: userPoints } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', gabrielId)
    .eq('week_start', weekStart)
    .single()
  
  if (userPoints) {
    console.log(`Exercise points: ${userPoints.exercise_points}`)
    console.log(`Habit points: ${userPoints.habit_points}`)
    console.log(`Badge points: ${userPoints.badge_points} ${userPoints.badge_points !== expectedBadgePoints ? '⚠️ MISMATCH!' : '✓'}`)
    console.log(`Total points: ${userPoints.total_points || (userPoints.exercise_points + userPoints.habit_points + userPoints.badge_points)}`)
    console.log(`Last updated: ${new Date(userPoints.updated_at).toLocaleString()}`)
  } else {
    console.log('No user_points record found')
  }
  
  console.log('\n3. CHECKING OTHER USERS')
  console.log('=' .repeat(40))
  
  // Check a few other users to see if they have the same issue
  const { data: allUserPoints } = await supabase
    .from('user_points')
    .select('user_id, badge_points')
    .eq('week_start', weekStart)
    .gt('badge_points', 0)
    .limit(5)
  
  for (const up of allUserPoints || []) {
    // Count their actual badges
    const { data: userBadges } = await supabase
      .from('user_badges')
      .select('tier')
      .eq('user_id', up.user_id)
    
    let actualPoints = 0
    userBadges?.forEach(b => {
      if (b.tier === 'gold') actualPoints += 10
      else if (b.tier === 'silver') actualPoints += 6
      else if (b.tier === 'bronze') actualPoints += 3
    })
    
    const match = actualPoints === up.badge_points ? '✓' : '⚠️ MISMATCH!'
    console.log(`  User ${up.user_id.substring(0, 8)}: stored=${up.badge_points}, actual=${actualPoints} ${match}`)
  }
  
  console.log('\n4. FIXING GABRIEL\'S POINTS')
  console.log('=' .repeat(40))
  
  if (userPoints && userPoints.badge_points !== expectedBadgePoints) {
    console.log(`Updating badge points from ${userPoints.badge_points} to ${expectedBadgePoints}...`)
    
    const { error } = await supabase
      .from('user_points')
      .update({
        badge_points: expectedBadgePoints,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', gabrielId)
      .eq('week_start', weekStart)
    
    if (error) {
      console.error('Error updating points:', error)
    } else {
      const newTotal = userPoints.exercise_points + userPoints.habit_points + expectedBadgePoints
      console.log('✓ Updated successfully!')
      console.log(`New total points: ${newTotal.toFixed(2)}`)
    }
  } else {
    console.log('Points are already correct')
  }
  
  console.log('\n5. BADGE HISTORY')
  console.log('=' .repeat(40))
  
  // Show recent badge changes
  const { data: recentBadges } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', gabrielId)
    .order('earned_at', { ascending: false })
    .limit(5)
  
  console.log('Recent badge activity:')
  recentBadges?.forEach(badge => {
    const earned = new Date(badge.earned_at).toLocaleString()
    console.log(`  ${earned}: ${badge.tier} ${badge.name}`)
  })
  
  console.log('\n' + '=' .repeat(80))
  console.log('AUDIT COMPLETE')
  console.log('=' .repeat(80))
}

auditBadgesAndPoints().catch(console.error)