#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkDuplicatesAndPoints() {
  // Check for duplicate strava_activity_ids
  const { data: activities, error } = await supabase
    .from('strava_activities')
    .select('strava_activity_id, user_id, name, moving_time, start_date')
    .order('start_date', { ascending: false })
  
  if (error) {
    console.error('Error fetching activities:', error)
    return
  }

  // Group by strava_activity_id to find duplicates
  const activityMap = new Map()
  activities.forEach(activity => {
    const key = activity.strava_activity_id
    if (!activityMap.has(key)) {
      activityMap.set(key, [])
    }
    activityMap.get(key).push(activity)
  })

  // Find duplicates
  console.log('\n=== CHECKING FOR DUPLICATE ACTIVITIES ===')
  let hasDuplicates = false
  activityMap.forEach((activityList, stravaId) => {
    if (activityList.length > 1) {
      hasDuplicates = true
      console.log(`\nDuplicate found for Strava Activity ID: ${stravaId}`)
      activityList.forEach(a => {
        console.log(`  User: ${a.user_id.substring(0, 8)}..., Name: ${a.name}, Date: ${a.start_date}`)
      })
    }
  })
  
  if (!hasDuplicates) {
    console.log('No duplicate strava_activity_ids found!')
  }

  // Check weekly points vs actual activities
  console.log('\n=== CHECKING WEEKLY POINTS ACCURACY ===')
  
  // Get current week start
  function getWeekStart(date) {
    const d = new Date(date)
    const day = d.getUTCDay()
    const diff = d.getUTCDate() - day
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
  }
  
  function getWeekEnd(weekStart) {
    const end = new Date(weekStart)
    end.setUTCDate(end.getUTCDate() + 6)
    end.setUTCHours(23, 59, 59, 999)
    return end
  }

  const weekStart = getWeekStart(new Date())
  const weekEnd = getWeekEnd(weekStart)
  const weekStartStr = weekStart.toISOString().split('T')[0]

  // Get user points for this week
  const { data: userPoints } = await supabase
    .from('user_points')
    .select('user_id, total_hours, total_points, activities_count')
    .eq('week_start', weekStartStr)

  // Get user profiles for names
  const userIds = userPoints?.map(p => p.user_id) || []
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', userIds)
  
  const profileMap = new Map(
    profiles?.map(p => [p.id, p.full_name || p.email?.split('@')[0] || 'Unknown']) || []
  )

  // For each user with points, calculate actual hours from activities
  for (const userPoint of userPoints || []) {
    const { data: userActivities } = await supabase
      .from('strava_activities')
      .select('strava_activity_id, name, moving_time, start_date')
      .eq('user_id', userPoint.user_id)
      .gte('start_date', weekStart.toISOString())
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)

    const actualHours = userActivities?.reduce((sum, a) => sum + (a.moving_time / 3600), 0) || 0
    const actualPoints = Math.min(actualHours, 10)
    
    const userName = profileMap.get(userPoint.user_id)
    
    if (Math.abs(actualHours - userPoint.total_hours) > 0.1) { // Allow small rounding differences
      console.log(`\nMISMATCH for ${userName}:`)
      console.log(`  Stored: ${userPoint.total_hours.toFixed(2)}h (${userPoint.total_points.toFixed(2)} pts)`)
      console.log(`  Actual: ${actualHours.toFixed(2)}h (${actualPoints.toFixed(2)} pts)`)
      console.log(`  Difference: ${(userPoint.total_hours - actualHours).toFixed(2)}h`)
      console.log(`  Activities in DB: ${userActivities?.length || 0}, Stored count: ${userPoint.activities_count}`)
      
      // Show the activities
      if (userActivities && userActivities.length > 0) {
        console.log('  Activities:')
        userActivities.forEach(a => {
          console.log(`    - ${a.name}: ${(a.moving_time / 3600).toFixed(2)}h on ${a.start_date}`)
        })
      }
    }
  }

  console.log('\n=== CHECKING FOR GABRIEL AND BRIAN SPECIFICALLY ===')
  
  // Find Gabriel and Brian's user IDs
  const { data: gabrielProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .or('full_name.ilike.%gabriel%beal%,email.eq.gabrielbeal@gmail.com')
    .single()
  
  const { data: brianProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .or('full_name.ilike.%brian%clonaris%')
    .single()

  if (gabrielProfile) {
    console.log('\nGabriel Beal:')
    const { data: gabrielPoints } = await supabase
      .from('user_points')
      .select('*')
      .eq('user_id', gabrielProfile.id)
      .eq('week_start', weekStartStr)
      .single()
    
    if (gabrielPoints) {
      console.log(`  Stored: ${gabrielPoints.total_hours.toFixed(2)}h, ${gabrielPoints.activities_count} activities`)
      
      const { data: gabrielActivities } = await supabase
        .from('strava_activities')
        .select('name, moving_time, start_date')
        .eq('user_id', gabrielProfile.id)
        .gte('start_date', weekStart.toISOString())
        .lte('start_date', weekEnd.toISOString())
        .is('deleted_at', null)
        
      const actualHours = gabrielActivities?.reduce((sum, a) => sum + (a.moving_time / 3600), 0) || 0
      console.log(`  Actual: ${actualHours.toFixed(2)}h from ${gabrielActivities?.length || 0} activities`)
    }
  }

  if (brianProfile) {
    console.log('\nBrian Clonaris:')
    const { data: brianPoints } = await supabase
      .from('user_points')
      .select('*')
      .eq('user_id', brianProfile.id)
      .eq('week_start', weekStartStr)
      .single()
    
    if (brianPoints) {
      console.log(`  Stored: ${brianPoints.total_hours.toFixed(2)}h, ${brianPoints.activities_count} activities`)
      
      const { data: brianActivities } = await supabase
        .from('strava_activities')
        .select('name, moving_time, start_date')
        .eq('user_id', brianProfile.id)
        .gte('start_date', weekStart.toISOString())
        .lte('start_date', weekEnd.toISOString())
        .is('deleted_at', null)
        
      const actualHours = brianActivities?.reduce((sum, a) => sum + (a.moving_time / 3600), 0) || 0
      console.log(`  Actual: ${actualHours.toFixed(2)}h from ${brianActivities?.length || 0} activities`)
    }
  }

  process.exit(0)
}

checkDuplicatesAndPoints()