import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BadgeCalculator } from '@/lib/badges/BadgeCalculator'
import { recalculateAndApplyExercisePointsForWeek } from '@/lib/points-helpers'
import { getWeekBoundaries } from '@/lib/date-helpers'

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
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = typeof connection.expires_at === 'string' 
      ? Math.floor(new Date(connection.expires_at).getTime() / 1000)
      : connection.expires_at
    
    if (expiresAt <= now) {
      const refreshed = await refreshStravaToken(connection.refresh_token)
      if (refreshed) {
        await supabase
          .from('strava_connections')
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: refreshed.expires_at
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

    // Fetch user's timezone for accurate weekly boundaries
    let userTimezone = 'UTC'
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', user.id)
      .single()
    if (profile?.timezone) userTimezone = profile.timezone

    // Create badge calculator instance
    const badgeCalculator = new BadgeCalculator(supabase)

    // Store activities in database
    let syncedCount = 0
    const affectedDates: Date[] = []
    
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
          photo_count: activity.total_photo_count || activity.photo_count || 0,
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
          suffer_score: activity.suffer_score,
          deleted_at: null
        }, {
          onConflict: 'strava_activity_id'
        })

      if (!error) {
        syncedCount++
        // Track the specific activity date for precise weekly recalculation
        affectedDates.push(new Date(activity.start_date_local || activity.start_date))
        
        // Calculate badges for this activity
        await badgeCalculator.calculateBadgesForActivity({
          strava_activity_id: activity.id,
          user_id: user.id,
          start_date_local: activity.start_date_local,
          distance: activity.distance,
          moving_time: activity.moving_time,
          elapsed_time: activity.elapsed_time,
          calories: activity.calories || 0,
          total_elevation_gain: activity.total_elevation_gain,
          average_speed: activity.average_speed,
          type: activity.type,
          sport_type: activity.sport_type,
          athlete_count: activity.athlete_count,
          photo_count: activity.photo_count
        })
      }
    }
    
    // Recalculate and apply exercise points for every affected date (helper is idempotent)
    const processedWeeks = new Set<string>()
    for (const date of affectedDates) {
      // Deduplicate by computed week_start in user's timezone
      const { weekStart } = getWeekBoundaries(date, userTimezone)
      const weekKey = weekStart.toISOString().split('T')[0]
      if (processedWeeks.has(weekKey)) continue
      await recalculateAndApplyExercisePointsForWeek(user.id, date, userTimezone, supabase)
      processedWeeks.add(weekKey)
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

// legacy recalculation removed; unified via recalculateAndApplyExercisePointsForWeek
