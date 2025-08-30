import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BadgeCalculator } from '@/lib/badges/BadgeCalculator'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's Strava connection
    const { data: connection } = await supabase
      .from('strava_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'No Strava connection found' }, { status: 404 })
    }

    // Check if token needs refresh
    if (new Date(connection.expires_at) < new Date()) {
      const refreshed = await refreshStravaToken(connection.refresh_token)
      if (refreshed) {
        await supabase
          .from('strava_connections')
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: new Date(refreshed.expires_at * 1000).toISOString()
          })
          .eq('user_id', user.id)
        
        connection.access_token = refreshed.access_token
      }
    }

    // Fetch activities from Strava (last 30 activities)
    const response = await fetch(
      'https://www.strava.com/api/v3/athlete/activities?per_page=30',
      {
        headers: {
          'Authorization': `Bearer ${connection.access_token}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status}`)
    }

    const activities = await response.json()

    // Create badge calculator instance
    const badgeCalculator = new BadgeCalculator(supabase)

    // Store activities in database
    let syncedCount = 0
    const affectedWeeks = new Set<string>()
    
    for (const activity of activities) {
      const { error } = await supabase
        .from('strava_activities')
        .upsert({
          user_id: user.id,
          strava_activity_id: activity.id,
          strava_athlete_id: activity.athlete.id,
          name: activity.name,
          distance: activity.distance,
          moving_time: activity.moving_time,
          elapsed_time: activity.elapsed_time,
          total_elevation_gain: activity.total_elevation_gain,
          type: activity.type,
          sport_type: activity.sport_type,
          start_date: activity.start_date,
          start_date_local: activity.start_date_local,
          timezone: activity.timezone,
          achievement_count: activity.achievement_count,
          kudos_count: activity.kudos_count,
          comment_count: activity.comment_count,
          athlete_count: activity.athlete_count,
          photo_count: activity.photo_count,
          map_summary_polyline: activity.map?.summary_polyline,
          trainer: activity.trainer,
          commute: activity.commute,
          manual: activity.manual,
          private: activity.private,
          visibility: activity.visibility,
          flagged: activity.flagged,
          average_speed: activity.average_speed,
          max_speed: activity.max_speed,
          average_cadence: activity.average_cadence,
          average_heartrate: activity.average_heartrate,
          max_heartrate: activity.max_heartrate,
          average_watts: activity.average_watts,
          kilojoules: activity.kilojoules,
          device_watts: activity.device_watts,
          has_heartrate: activity.has_heartrate,
          calories: activity.calories,
          deleted_at: null
        }, {
          onConflict: 'strava_activity_id'
        })

      if (!error) {
        syncedCount++
        
        // Track which weeks are affected
        const weekStart = getWeekStart(new Date(activity.start_date))
        affectedWeeks.add(weekStart.toISOString().split('T')[0])
        
        // Calculate badges for this activity
        await badgeCalculator.calculateBadgesForActivity({
          strava_activity_id: activity.id,
          user_id: user.id,
          start_date_local: activity.start_date_local,
          distance: activity.distance,
          moving_time: activity.moving_time,
          calories: activity.calories || 0,
          total_elevation_gain: activity.total_elevation_gain,
          average_speed: activity.average_speed,
          type: activity.type,
          sport_type: activity.sport_type
        })
      }
    }
    
    // Recalculate points for all affected weeks
    for (const weekStartStr of affectedWeeks) {
      await recalculateWeeklyPoints(user.id, new Date(weekStartStr), supabase)
    }
    
    // Ensure user has a division assignment (if they don't have one yet)
    const { data: userDivision } = await supabase
      .from('user_divisions')
      .select('id')
      .eq('user_id', user.id)
      .single()
    
    if (!userDivision) {
      // Assign to Noodle division if not assigned
      const { data: noodleDivision } = await supabase
        .from('divisions')
        .select('id')
        .eq('name', 'Noodle')
        .single()
      
      if (noodleDivision) {
        await supabase
          .from('user_divisions')
          .insert({
            user_id: user.id,
            division_id: noodleDivision.id
          })
        
        console.log(`Assigned user ${user.id} to Noodle division`)
      }
    }

    return NextResponse.json({ 
      success: true, 
      count: syncedCount,
      total: activities.length 
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ 
      error: 'Failed to sync activities' 
    }, { status: 500 })
  }
}

async function refreshStravaToken(refreshToken: string) {
  try {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    return await response.json()
  } catch (error) {
    console.error('Token refresh error:', error)
    return null
  }
}

// Helper functions for week calculations
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart)
  end.setUTCDate(end.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return end
}

// Recalculate all points for a user for a given week
async function recalculateWeeklyPoints(userId: string, weekStart: Date, supabase: SupabaseClient) {
  try {
    const weekEnd = getWeekEnd(weekStart)
    
    // Get all activities for this user in this week
    const { data: activities, error } = await supabase
      .from('strava_activities')
      .select('moving_time, start_date')
      .eq('user_id', userId)
      .gte('start_date', weekStart.toISOString())
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)
    
    if (error) {
      console.error('Error fetching activities for points calculation:', error)
      return
    }
    
    // Calculate total hours and points
    const totalHours = activities.reduce((sum, activity) => sum + (activity.moving_time / 3600), 0)
    const totalPoints = Math.min(totalHours, 10) // Cap at 10 points
    
    // Update or insert user_points record
    const { data: existingPoints } = await supabase
      .from('user_points')
      .select('id')
      .eq('user_id', userId)
      .eq('week_start', weekStart.toISOString().split('T')[0])
      .single()
    
    if (existingPoints) {
      await supabase
        .from('user_points')
        .update({
          total_hours: totalHours,
          total_points: totalPoints,
          activities_count: activities.length,
          last_activity_at: activities.length > 0 ? activities[activities.length - 1].start_date : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingPoints.id)
      
      console.log(`Updated weekly points for user ${userId}: ${totalPoints.toFixed(2)} points (${totalHours.toFixed(2)} hours) from ${activities.length} activities`)
    } else if (activities.length > 0) {
      await supabase
        .from('user_points')
        .insert({
          user_id: userId,
          week_start: weekStart.toISOString().split('T')[0],
          week_end: weekEnd.toISOString().split('T')[0],
          total_hours: totalHours,
          total_points: totalPoints,
          activities_count: activities.length,
          last_activity_at: activities[activities.length - 1].start_date
        })
      
      console.log(`Created weekly points for user ${userId}: ${totalPoints.toFixed(2)} points (${totalHours.toFixed(2)} hours) from ${activities.length} activities`)
    }
  } catch (error) {
    console.error('Error calculating user points:', error)
    // Don't throw to prevent sync failure
  }
}