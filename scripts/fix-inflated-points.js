#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Helper functions for week calculations
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

async function fixInflatedPoints() {
  console.log('=== FIXING INFLATED POINTS DATA ===\n')
  
  // Get all user_points records
  const { data: allPoints, error } = await supabase
    .from('user_points')
    .select('*')
    .order('week_start', { ascending: false })
  
  if (error) {
    console.error('Error fetching user points:', error)
    return
  }

  console.log(`Found ${allPoints.length} user_points records to check\n`)

  let fixedCount = 0
  let errorCount = 0

  // Group by week for better logging
  const weekMap = new Map()
  allPoints.forEach(point => {
    if (!weekMap.has(point.week_start)) {
      weekMap.set(point.week_start, [])
    }
    weekMap.get(point.week_start).push(point)
  })

  // Process each week
  for (const [weekStartStr, weekPoints] of weekMap) {
    console.log(`Processing week ${weekStartStr}:`)
    const weekStart = new Date(weekStartStr)
    const weekEnd = getWeekEnd(weekStart)

    for (const userPoint of weekPoints) {
      // Get actual activities for this user and week
      const { data: activities, error: activitiesError } = await supabase
        .from('strava_activities')
        .select('strava_activity_id, name, moving_time, start_date')
        .eq('user_id', userPoint.user_id)
        .gte('start_date', weekStart.toISOString())
        .lte('start_date', weekEnd.toISOString())
        .is('deleted_at', null)

      if (activitiesError) {
        console.error(`  ❌ Error fetching activities for user ${userPoint.user_id}:`, activitiesError)
        errorCount++
        continue
      }

      // Calculate actual totals
      const actualHours = activities.reduce((sum, a) => sum + (a.moving_time / 3600), 0)
      const actualPoints = Math.min(actualHours, 10)

      // Check if update is needed (allow small rounding differences)
      if (Math.abs(actualHours - userPoint.total_hours) > 0.01) {
        // Get user name for logging
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, email')
          .eq('id', userPoint.user_id)
          .single()
        
        const userName = profile?.full_name || profile?.email?.split('@')[0] || `User ${userPoint.user_id.substring(0, 8)}`
        
        console.log(`  📝 ${userName}:`)
        console.log(`     Before: ${userPoint.total_hours.toFixed(2)}h (${userPoint.total_points.toFixed(2)} pts) from ${userPoint.activities_count} activities`)
        console.log(`     After:  ${actualHours.toFixed(2)}h (${actualPoints.toFixed(2)} pts) from ${activities.length} activities`)
        console.log(`     Fixed:  ${(userPoint.total_hours - actualHours).toFixed(2)}h inflated`)

        // Update the record with correct values
        const { error: updateError } = await supabase
          .from('user_points')
          .update({
            total_hours: actualHours,
            total_points: actualPoints,
            activities_count: activities.length,
            last_activity_at: activities.length > 0 ? activities[activities.length - 1].start_date : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', userPoint.id)

        if (updateError) {
          console.error(`     ❌ Failed to update:`, updateError)
          errorCount++
        } else {
          console.log(`     ✅ Successfully updated`)
          fixedCount++
        }
      }
    }
    console.log()
  }

  console.log('=== SUMMARY ===')
  console.log(`✅ Fixed ${fixedCount} inflated records`)
  if (errorCount > 0) {
    console.log(`❌ Failed to fix ${errorCount} records`)
  }
  console.log(`📊 Checked ${allPoints.length} total records`)

  // Verify specific users
  console.log('\n=== VERIFYING GABRIEL AND BRIAN ===')
  
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

  const currentWeekStart = getWeekStart(new Date())
  const currentWeekStartStr = currentWeekStart.toISOString().split('T')[0]

  if (gabrielProfile) {
    const { data: gabrielPoints } = await supabase
      .from('user_points')
      .select('total_hours, total_points, activities_count')
      .eq('user_id', gabrielProfile.id)
      .eq('week_start', currentWeekStartStr)
      .single()
    
    if (gabrielPoints) {
      console.log(`Gabriel Beal: ${gabrielPoints.total_hours.toFixed(2)}h (${gabrielPoints.total_points.toFixed(2)} pts) from ${gabrielPoints.activities_count} activities`)
    }
  }

  if (brianProfile) {
    const { data: brianPoints } = await supabase
      .from('user_points')
      .select('total_hours, total_points, activities_count')
      .eq('user_id', brianProfile.id)
      .eq('week_start', currentWeekStartStr)
      .single()
    
    if (brianPoints) {
      console.log(`Brian Clonaris: ${brianPoints.total_hours.toFixed(2)}h (${brianPoints.total_points.toFixed(2)} pts) from ${brianPoints.activities_count} activities`)
    }
  }

  process.exit(0)
}

fixInflatedPoints()