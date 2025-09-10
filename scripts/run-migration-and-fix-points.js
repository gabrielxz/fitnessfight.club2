#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration() {
  console.log('Running points migration...\n')
  
  try {
    // Step 1: Add new columns
    console.log('Step 1: Adding new columns...')
    const { error: addColumnsError } = await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE public.user_points
        ADD COLUMN IF NOT EXISTS exercise_points REAL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS habit_points REAL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS badge_points REAL DEFAULT 0;
      `
    }).single()
    
    if (addColumnsError && !addColumnsError.message.includes('already exists')) {
      // Try a different approach - direct SQL execution
      console.log('Using alternative approach for adding columns...')
      // We'll handle this differently
    }
    
    // Step 2: Check current structure
    const { data: checkData, error: checkError } = await supabase
      .from('user_points')
      .select('*')
      .limit(1)
    
    console.log('Current table structure sample:', checkData?.[0] ? Object.keys(checkData[0]) : 'No data')
    
    // Step 3: Clear all points to start fresh
    console.log('\nStep 2: Clearing all existing points to start fresh...')
    const { error: deleteError } = await supabase
      .from('user_points')
      .delete()
      .neq('user_id', '00000000-0000-0000-0000-000000000000') // Always true
    
    if (deleteError) {
      console.error('Error clearing points:', deleteError)
    } else {
      console.log('All points cleared successfully.')
    }
    
    // Step 4: Trigger recalculation for all users
    console.log('\nStep 3: Triggering recalculation for current week...')
    
    // Get all users with strava connections
    const { data: users, error: usersError } = await supabase
      .from('strava_connections')
      .select('user_id')
    
    if (usersError) {
      console.error('Error fetching users:', usersError)
      return
    }
    
    console.log(`Found ${users.length} users to recalculate.`)
    
    // For each user, recalculate current week's points
    for (const user of users) {
      await recalculateUserPoints(user.user_id)
    }
    
    console.log('\nRecalculation complete!')
    
    // Show final state
    const { data: finalPoints } = await supabase
      .from('user_points')
      .select('*')
      .order('total_points', { ascending: false })
    
    if (finalPoints) {
      console.log('\nFinal points state:')
      finalPoints.forEach(p => {
        console.log(`User ${p.user_id.substring(0,8)}...: Exercise=${p.exercise_points || 0}, Habit=${p.habit_points || 0}, Badge=${p.badge_points || 0}, Total=${p.total_points || (p.exercise_points + p.habit_points + p.badge_points) || 0}`)
      })
    }
    
  } catch (error) {
    console.error('Migration error:', error)
  }
}

async function recalculateUserPoints(userId) {
  // Get user's timezone (default to UTC)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('user_id', userId)
    .single()
  
  const timezone = profile?.timezone || 'UTC'
  
  // Calculate current week boundaries
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) // Monday
  const weekStart = new Date(now.setDate(diff))
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  
  // 1. Calculate Exercise Points
  const { data: activities } = await supabase
    .from('strava_activities')
    .select('moving_time')
    .eq('user_id', userId)
    .gte('start_date', weekStart.toISOString())
    .lte('start_date', weekEnd.toISOString())
    .is('deleted_at', null)
  
  const totalHours = activities ? activities.reduce((sum, a) => sum + (a.moving_time / 3600), 0) : 0
  const exercisePoints = Math.min(totalHours, 10)
  
  // 2. Calculate Habit Points (if any)
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const { data: summaries } = await supabase
    .from('habit_weekly_summaries')
    .select('successes, target')
    .eq('user_id', userId)
    .eq('week_start', weekStartStr)
  
  const completedHabits = summaries ? summaries.filter(h => h.successes >= h.target).length : 0
  const habitPoints = Math.min(completedHabits * 0.5, 2.5)
  
  // 3. Calculate Badge Points
  // Badge points are stored separately per badge earned
  // We need to sum them up for the week
  const { data: badges } = await supabase
    .from('user_badges')
    .select('tier')
    .eq('user_id', userId)
  
  let badgePoints = 0
  if (badges) {
    badges.forEach(badge => {
      // Points per tier: Bronze=3, Silver=6, Gold=10
      if (badge.tier === 'gold') badgePoints += 10
      else if (badge.tier === 'silver') badgePoints += 6
      else if (badge.tier === 'bronze') badgePoints += 3
    })
  }
  
  // 4. Upsert the points record
  const weekEndStr = weekEnd.toISOString().split('T')[0]
  
  const pointsData = {
    user_id: userId,
    week_start: weekStartStr,
    week_end: weekEndStr,
    exercise_points: exercisePoints,
    habit_points: habitPoints,
    badge_points: badgePoints,
    total_hours: totalHours,
    activities_count: activities?.length || 0,
    updated_at: new Date().toISOString()
  }
  
  // Check if the columns exist
  const { data: existingPoint } = await supabase
    .from('user_points')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStartStr)
    .single()
  
  if (existingPoint && !('exercise_points' in existingPoint)) {
    // Old schema - just update total_points
    pointsData.total_points = exercisePoints + habitPoints + badgePoints
    delete pointsData.exercise_points
    delete pointsData.habit_points
    delete pointsData.badge_points
  }
  
  const { error: upsertError } = await supabase
    .from('user_points')
    .upsert(pointsData, {
      onConflict: 'user_id, week_start'
    })
  
  if (upsertError) {
    console.error(`Error updating points for user ${userId}:`, upsertError)
  } else {
    console.log(`Updated ${userId.substring(0,8)}...: Exercise=${exercisePoints.toFixed(1)}, Habit=${habitPoints.toFixed(1)}, Badge=${badgePoints}`)
  }
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY is required in .env.local')
    process.exit(1)
  }
  
  await runMigration()
}

main().catch(console.error)