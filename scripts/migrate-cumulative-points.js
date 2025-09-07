#!/usr/bin/env node

/**
 * Migration script to populate cumulative_points from historical data
 * This calculates the true cumulative total from all sources:
 * - Historical exercise points from user_points table
 * - Historical habit completions
 * - Badge tier points
 * 
 * Run with: node scripts/migrate-cumulative-points.js
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Please check your .env.local file.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function migrateCumulativePoints() {
  console.log('Starting cumulative points migration...')
  
  // Get all users
  const { data: users, error: usersError } = await supabase
    .from('user_profiles')
    .select('id')
  
  if (usersError) {
    console.error('Error fetching users:', usersError)
    return
  }
  
  console.log(`Found ${users.length} users to migrate`)
  
  for (const user of users) {
    let totalPoints = 0
    
    // 1. Sum all historical exercise points from user_points
    const { data: weeklyPoints, error: pointsError } = await supabase
      .from('user_points')
      .select('total_points')
      .eq('user_id', user.id)
    
    if (!pointsError && weeklyPoints) {
      const exercisePoints = weeklyPoints.reduce((sum, week) => sum + (week.total_points || 0), 0)
      totalPoints += exercisePoints
      console.log(`User ${user.id}: ${exercisePoints.toFixed(2)} exercise points from ${weeklyPoints.length} weeks`)
    }
    
    // 2. Calculate historical habit points
    // Get user's first 5 habits (only these earn points)
    const { data: habits, error: habitsError } = await supabase
      .from('habits')
      .select('id')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(5)
    
    if (!habitsError && habits && habits.length > 0) {
      const habitIds = habits.map(h => h.id)
      
      // Get all weekly summaries where target was met
      const { data: completedHabits, error: summariesError } = await supabase
        .from('habit_weekly_summaries')
        .select('id')
        .in('habit_id', habitIds)
        .gte('successes', supabase.raw('target'))
      
      if (!summariesError && completedHabits) {
        const habitPoints = completedHabits.length * 0.5
        totalPoints += habitPoints
        console.log(`User ${user.id}: ${habitPoints.toFixed(2)} habit points from ${completedHabits.length} completed habits`)
      }
    }
    
    // 3. Calculate badge tier points
    const { data: badges, error: badgesError } = await supabase
      .from('user_badges')
      .select('tier, points_awarded')
      .eq('user_id', user.id)
    
    if (!badgesError && badges) {
      let badgePoints = 0
      const tierValues = { bronze: 3, silver: 6, gold: 10 }
      
      for (const badge of badges) {
        // Use points_awarded if available, otherwise calculate from tier
        if (badge.points_awarded) {
          badgePoints += badge.points_awarded
        } else if (badge.tier && tierValues[badge.tier]) {
          badgePoints += tierValues[badge.tier]
        }
      }
      
      totalPoints += badgePoints
      if (badgePoints > 0) {
        console.log(`User ${user.id}: ${badgePoints} badge points from ${badges.length} badges`)
      }
    }
    
    // Update user profile with cumulative points
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        cumulative_points: totalPoints,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
    
    if (updateError) {
      console.error(`Error updating user ${user.id}:`, updateError)
    } else {
      console.log(`User ${user.id}: Total cumulative points = ${totalPoints.toFixed(2)}`)
    }
  }
  
  console.log('Migration completed!')
}

async function main() {
  console.log('Cumulative Points Migration')
  console.log('============================')
  console.log('This will calculate and set cumulative_points for all users')
  console.log('based on their historical exercise, habits, and badges.')
  console.log('')
  
  try {
    await migrateCumulativePoints()
    console.log('')
    console.log('Migration completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

main()