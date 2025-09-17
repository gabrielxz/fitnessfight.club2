#!/usr/bin/env node

/**
 * Script to populate cumulative points from all historical data
 * This properly calculates:
 * - Exercise points from all activities (1 point per hour, max 10/week)
 * - Habit points from completed habits (0.5 points each, max 5 habits)
 * - Badge points from earned badges
 *
 * Run with: node scripts/populate-cumulative-points.js
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

// Helper to get week boundaries
function getWeekBoundaries(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const weekStart = new Date(d.setDate(diff))
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  return { weekStart, weekEnd }
}

async function calculateExercisePoints(userId) {
  // Get all activities for the user
  const { data: activities, error } = await supabase
    .from('strava_activities')
    .select('start_date, moving_time')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('start_date', { ascending: true })

  if (error || !activities) {
    console.error(`Error fetching activities for user ${userId}:`, error)
    return 0
  }

  // Group activities by week and calculate points
  const weeklyHours = new Map()

  for (const activity of activities) {
    const { weekStart } = getWeekBoundaries(activity.start_date)
    const weekKey = weekStart.toISOString().split('T')[0]

    const hours = activity.moving_time / 3600
    const currentHours = weeklyHours.get(weekKey) || 0
    weeklyHours.set(weekKey, currentHours + hours)
  }

  // Calculate total points (max 10 per week)
  let totalPoints = 0
  for (const [week, hours] of weeklyHours) {
    const points = Math.min(hours, 10)
    totalPoints += points

    // Also update the weekly_exercise_tracking table
    await supabase
      .from('weekly_exercise_tracking')
      .upsert({
        user_id: userId,
        week_start: week,
        hours_logged: hours,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, week_start'
      })
  }

  return totalPoints
}

async function calculateHabitPoints(userId) {
  // Get user's first 5 habits (only these earn points)
  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, target_frequency')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(5)

  if (habitsError || !habits || habits.length === 0) {
    return 0
  }

  let totalPoints = 0

  for (const habit of habits) {
    // Get all entries for this habit
    const { data: entries, error: entriesError } = await supabase
      .from('habit_entries')
      .select('date, week_start')
      .eq('habit_id', habit.id)
      .eq('user_id', userId)
      .eq('status', 'SUCCESS')

    if (entriesError || !entries) continue

    // Group by week
    const weeklySuccesses = new Map()
    for (const entry of entries) {
      const weekKey = entry.week_start || getWeekBoundaries(entry.date).weekStart.toISOString().split('T')[0]
      const count = weeklySuccesses.get(weekKey) || 0
      weeklySuccesses.set(weekKey, count + 1)
    }

    // Count weeks where target was met
    for (const [week, successes] of weeklySuccesses) {
      if (successes >= habit.target_frequency) {
        totalPoints += 0.5
      }
    }
  }

  return totalPoints
}

async function calculateBadgePoints(userId) {
  const { data: badges, error } = await supabase
    .from('user_badges')
    .select('tier, points_awarded')
    .eq('user_id', userId)

  if (error || !badges) {
    return 0
  }

  const tierValues = { bronze: 3, silver: 6, gold: 15 }
  let totalPoints = 0

  for (const badge of badges) {
    // Use points_awarded if available, otherwise calculate from tier
    if (badge.points_awarded !== null && badge.points_awarded !== undefined) {
      totalPoints += badge.points_awarded
    } else if (badge.tier && tierValues[badge.tier]) {
      totalPoints += tierValues[badge.tier]
    }
  }

  return totalPoints
}

async function populateUserPoints(userId) {
  console.log(`\nProcessing user ${userId.substring(0, 8)}...`)

  // Calculate points from each source
  const exercisePoints = await calculateExercisePoints(userId)
  const habitPoints = await calculateHabitPoints(userId)
  const badgePoints = await calculateBadgePoints(userId)

  console.log(`  Exercise: ${exercisePoints.toFixed(2)} points`)
  console.log(`  Habits: ${habitPoints.toFixed(2)} points`)
  console.log(`  Badges: ${badgePoints} points`)
  console.log(`  TOTAL: ${(exercisePoints + habitPoints + badgePoints).toFixed(2)} points`)

  // Update user profile with cumulative points
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({
      cumulative_exercise_points: exercisePoints,
      cumulative_habit_points: habitPoints,
      cumulative_badge_points: badgePoints,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)

  if (updateError) {
    console.error(`  ERROR updating user: ${updateError.message}`)
    return false
  }

  return true
}

async function main() {
  console.log('Cumulative Points Population Script')
  console.log('====================================')
  console.log('This will calculate and populate cumulative points for all users')
  console.log('based on their complete historical data.')
  console.log('')

  // Get all users
  const { data: users, error: usersError } = await supabase
    .from('user_profiles')
    .select('id')
    .order('created_at', { ascending: true })

  if (usersError) {
    console.error('Error fetching users:', usersError)
    process.exit(1)
  }

  console.log(`Found ${users.length} users to process`)

  let successCount = 0
  for (const user of users) {
    const success = await populateUserPoints(user.id)
    if (success) successCount++
  }

  console.log('')
  console.log('====================================')
  console.log(`Successfully processed ${successCount}/${users.length} users`)
  console.log('Population script completed!')
}

main().catch(error => {
  console.error('Script failed:', error)
  process.exit(1)
})