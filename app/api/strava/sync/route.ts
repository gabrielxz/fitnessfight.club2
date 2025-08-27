import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Store activities in database
    let syncedCount = 0
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