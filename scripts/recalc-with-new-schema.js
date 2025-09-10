#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function recalculateAllPoints() {
  console.log('Recalculating points for all users with new schema...\n')
  
  // Get all users with strava connections
  const { data: users, error: usersError } = await supabase
    .from('strava_connections')
    .select('user_id')
  
  if (usersError) {
    console.error('Error fetching users:', usersError)
    return
  }
  
  console.log(`Found ${users.length} users to recalculate.`)
  
  // Calculate current week boundaries
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) // Monday
  const weekStart = new Date(now.setDate(diff))
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]
  
  console.log(`Calculating for week: ${weekStartStr} to ${weekEndStr}\n`)
  
  // For each user, recalculate current week's points
  for (const user of users) {
    // 1. Calculate Exercise Points
    const { data: activities } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', user.user_id)
      .gte('start_date', weekStart.toISOString())
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)
    
    const totalHours = activities ? activities.reduce((sum, a) => sum + (a.moving_time / 3600), 0) : 0
    const exercisePoints = Math.min(totalHours, 10)
    
    // 2. Calculate Habit Points (if any)
    const { data: summaries } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target')
      .eq('user_id', user.user_id)
      .eq('week_start', weekStartStr)
    
    const completedHabits = summaries ? summaries.filter(h => h.successes >= h.target).length : 0
    const habitPoints = Math.min(completedHabits * 0.5, 2.5)
    
    // 3. Calculate Badge Points
    const { data: badges } = await supabase
      .from('user_badges')
      .select('tier')
      .eq('user_id', user.user_id)
    
    let badgePoints = 0
    if (badges) {
      badges.forEach(badge => {
        // Points per tier: Bronze=3, Silver=6, Gold=10
        if (badge.tier === 'gold') badgePoints += 10
        else if (badge.tier === 'silver') badgePoints += 6
        else if (badge.tier === 'bronze') badgePoints += 3
      })
    }
    
    // 4. Upsert the points record with new schema
    const pointsData = {
      user_id: user.user_id,
      week_start: weekStartStr,
      week_end: weekEndStr,
      exercise_points: exercisePoints,
      habit_points: habitPoints,
      badge_points: badgePoints,
      total_hours: totalHours,
      activities_count: activities?.length || 0,
      updated_at: new Date().toISOString()
    }
    
    const { error: upsertError } = await supabase
      .from('user_points')
      .upsert(pointsData, {
        onConflict: 'user_id, week_start'
      })
    
    if (upsertError) {
      console.error(`Error updating points for user ${user.user_id}:`, upsertError)
    } else {
      const total = exercisePoints + habitPoints + badgePoints
      console.log(`Updated ${user.user_id.substring(0,8)}...: Exercise=${exercisePoints.toFixed(1)}, Habit=${habitPoints.toFixed(1)}, Badge=${badgePoints}, Total=${total.toFixed(1)}`)
    }
  }
  
  console.log('\nRecalculation complete!')
  
  // Show final state
  const { data: finalPoints } = await supabase
    .from('user_points')
    .select('user_id, week_start, exercise_points, habit_points, badge_points, total_points, total_hours, activities_count')
    .eq('week_start', weekStartStr)
    .order('total_points', { ascending: false })
  
  if (finalPoints) {
    console.log('\nFinal points for current week:')
    finalPoints.forEach(p => {
      const total = p.total_points || (p.exercise_points + p.habit_points + p.badge_points)
      console.log(`User ${p.user_id.substring(0,8)}...: E=${p.exercise_points}, H=${p.habit_points}, B=${p.badge_points}, Total=${total} (${p.total_hours.toFixed(1)}h, ${p.activities_count} activities)`)
    })
  }
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required in .env.local')
    process.exit(1)
  }
  
  await recalculateAllPoints()
}

main().catch(console.error)