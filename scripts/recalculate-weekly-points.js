#!/usr/bin/env node

/**
 * Script to recalculate weekly points for all users
 * This fixes the points calculation after migrating from Sunday-based to Monday-based weeks
 * 
 * Run with: node scripts/recalculate-weekly-points.js
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

// Helper function to get Monday-based week start
function getMondayWeekStart(date) {
  const d = new Date(date)
  const day = d.getUTCDay()
  // If Sunday (0), treat as end of week (day 7)
  const adjustedDay = day === 0 ? 7 : day
  // Calculate days back to Monday (1)
  const diff = d.getUTCDate() - (adjustedDay - 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

// Helper function to format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0]
}

async function recalculateWeeklyPoints() {
  console.log('Recalculating weekly points for all users...')
  
  // Get current week start (Monday)
  const now = new Date()
  const currentWeekStart = getMondayWeekStart(now)
  const currentWeekStartStr = formatDate(currentWeekStart)
  
  // Get the week end (Sunday)
  const weekEnd = new Date(currentWeekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)
  
  console.log(`Current week: ${currentWeekStartStr} to ${formatDate(weekEnd)}`)
  
  // Get all users who have activities
  const { data: users, error: usersError } = await supabase
    .from('strava_activities')
    .select('user_id')
    .gte('start_date', currentWeekStart.toISOString())
    .lte('start_date', weekEnd.toISOString())
    .is('deleted_at', null)
  
  if (usersError) {
    console.error('Error fetching users:', usersError)
    return
  }
  
  // Get unique user IDs
  const uniqueUserIds = [...new Set(users.map(u => u.user_id))]
  console.log(`Found ${uniqueUserIds.length} users with activities this week`)
  
  for (const userId of uniqueUserIds) {
    // Get all activities for this user in the current week
    const { data: activities, error: activitiesError } = await supabase
      .from('strava_activities')
      .select('moving_time, start_date')
      .eq('user_id', userId)
      .gte('start_date', currentWeekStart.toISOString())
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)
    
    if (activitiesError) {
      console.error(`Error fetching activities for user ${userId}:`, activitiesError)
      continue
    }
    
    // Calculate total hours and points
    const totalSeconds = activities.reduce((sum, activity) => sum + (activity.moving_time || 0), 0)
    const totalHours = totalSeconds / 3600
    const totalPoints = Math.min(totalHours, 10) // Cap at 10 points
    
    // Check for habit points (only for current week)
    const { data: habitSummaries, error: habitError } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target')
      .eq('user_id', userId)
      .eq('week_start', currentWeekStartStr)
    
    let habitPoints = 0
    if (!habitError && habitSummaries) {
      // Calculate habit points (0.5 per habit completed, max 5 habits = 2.5 points)
      const completedHabits = habitSummaries.filter(h => h.successes >= h.target).length
      habitPoints = Math.min(completedHabits * 0.5, 2.5)
    }
    
    const finalPoints = totalPoints + habitPoints
    
    console.log(`User ${userId}: ${totalHours.toFixed(2)} hours, ${habitPoints} habit points, ${finalPoints.toFixed(2)} total points`)
    
    // Check if user_points record exists
    const { data: existing, error: checkError } = await supabase
      .from('user_points')
      .select('id')
      .eq('user_id', userId)
      .eq('week_start', currentWeekStartStr)
      .single()
    
    if (existing) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('user_points')
        .update({
          total_hours: totalHours,
          total_points: finalPoints,
          habit_points: habitPoints,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
      
      if (updateError) {
        console.error(`Error updating points for user ${userId}:`, updateError)
      }
    } else {
      // Create new record
      const { error: insertError } = await supabase
        .from('user_points')
        .insert({
          user_id: userId,
          week_start: currentWeekStartStr,
          total_hours: totalHours,
          total_points: finalPoints,
          habit_points: habitPoints
        })
      
      if (insertError) {
        console.error(`Error creating points record for user ${userId}:`, insertError)
      }
    }
  }
  
  console.log('Points recalculation completed!')
}

async function main() {
  console.log('Starting weekly points recalculation...')
  console.log('This will recalculate points for the current week using Monday-Sunday boundaries')
  console.log('------------------------------------------------')
  
  try {
    await recalculateWeeklyPoints()
    console.log('------------------------------------------------')
    console.log('Recalculation completed successfully!')
  } catch (error) {
    console.error('Recalculation failed:', error)
    process.exit(1)
  }
}

main()