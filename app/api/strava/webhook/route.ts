import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// GET handler for webhook subscription verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Verify the subscription
  if (mode === 'subscribe' && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook subscription verified')
    return NextResponse.json({ 'hub.challenge': challenge })
  }

  return NextResponse.json({ error: 'Invalid verification' }, { status: 403 })
}

// POST handler for webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Webhook event received:', body)

    const {
      aspect_type,  // "create" | "update" | "delete"
      event_time,
      object_id,    // activity ID
      object_type,  // "activity" | "athlete"
      owner_id,     // athlete ID
      subscription_id,
      updates       // For update events, contains what changed
    } = body

    const supabase = await createClient()

    // Log the webhook event
    await supabase
      .from('strava_webhook_events')
      .insert({
        aspect_type,
        event_time: new Date(event_time * 1000).toISOString(),
        object_id,
        object_type,
        owner_id,
        subscription_id,
        updates: updates || null,
        processed: false
      })

    // Handle different event types
    if (object_type === 'activity') {
      // Get the user's Strava connection
      const { data: connection } = await supabase
        .from('strava_connections')
        .select('*')
        .eq('strava_athlete_id', owner_id)
        .single()

      if (!connection) {
        console.log(`No connection found for athlete ${owner_id}`)
        return NextResponse.json({ status: 'ok' })
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
            .eq('user_id', connection.user_id)
          
          connection.access_token = refreshed.access_token
        }
      }

      switch (aspect_type) {
        case 'create':
        case 'update':
          await fetchAndStoreActivity(object_id, connection, supabase)
          break
        case 'delete':
          await deleteActivity(object_id, supabase)
          break
      }
    }

    // Mark webhook as processed
    await supabase
      .from('strava_webhook_events')
      .update({ 
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('object_id', object_id)
      .eq('event_time', new Date(event_time * 1000).toISOString())

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
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

async function fetchAndStoreActivity(
  activityId: number,
  connection: {
    user_id: string
    access_token: string
    refresh_token: string
    expires_at: string
  },
  supabase: SupabaseClient
) {
  try {
    console.log(`Fetching activity ${activityId} from Strava API...`)
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}`,
      {
        headers: {
          'Authorization': `Bearer ${connection.access_token}`
        }
      }
    )

    if (!response.ok) {
      console.error(`Strava API error: ${response.status} ${response.statusText}`)
      throw new Error(`Failed to fetch activity: ${response.status}`)
    }

    const activity = await response.json()
    console.log(`Fetched activity: ${activity.name}, athlete: ${activity.athlete.id}`)

    // Upsert the activity
    const { error: dbError } = await supabase
      .from('strava_activities')
      .upsert({
        user_id: connection.user_id,
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
    
    if (dbError) {
      console.error(`Database error storing activity ${activityId}:`, dbError)
      throw dbError
    }

    console.log(`Activity ${activityId} stored successfully in database`)
    
    // Calculate points for this activity
    await calculateUserPoints(connection.user_id, activity, supabase)
  } catch (error) {
    console.error(`Error fetching/storing activity ${activityId}:`, error)
    throw error
  }
}

async function deleteActivity(activityId: number, supabase: SupabaseClient) {
  try {
    // Soft delete the activity
    await supabase
      .from('strava_activities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('strava_activity_id', activityId)

    console.log(`Activity ${activityId} marked as deleted`)
  } catch (error) {
    console.error(`Error deleting activity ${activityId}:`, error)
    throw error
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

// Calculate and update user points
interface Activity {
  start_date: string
  moving_time: number
}

async function calculateUserPoints(userId: string, activity: Activity, supabase: SupabaseClient) {
  try {
    const weekStart = getWeekStart(new Date(activity.start_date))
    const weekEnd = getWeekEnd(weekStart)
    
    // Get or create user_points record for this week
    const { data: existingPoints } = await supabase
      .from('user_points')
      .select('*')
      .eq('user_id', userId)
      .eq('week_start', weekStart.toISOString().split('T')[0])
      .single()
    
    const activityHours = activity.moving_time / 3600
    
    if (existingPoints) {
      const newTotalHours = existingPoints.total_hours + activityHours
      const newPoints = Math.min(newTotalHours, 10) // Cap at 10 points
      
      await supabase
        .from('user_points')
        .update({
          total_hours: newTotalHours,
          total_points: newPoints,
          activities_count: existingPoints.activities_count + 1,
          last_activity_at: activity.start_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingPoints.id)
      
      console.log(`Updated points for user ${userId}: ${newPoints.toFixed(2)} points (${newTotalHours.toFixed(2)} hours)`)
    } else {
      const points = Math.min(activityHours, 10)
      
      await supabase
        .from('user_points')
        .insert({
          user_id: userId,
          week_start: weekStart.toISOString().split('T')[0],
          week_end: weekEnd.toISOString().split('T')[0],
          total_hours: activityHours,
          total_points: points,
          activities_count: 1,
          last_activity_at: activity.start_date
        })
      
      console.log(`Created points for user ${userId}: ${points.toFixed(2)} points (${activityHours.toFixed(2)} hours)`)
    }
    
    // Ensure user has a division assignment
    const { data: userDivision } = await supabase
      .from('user_divisions')
      .select('id')
      .eq('user_id', userId)
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
            user_id: userId,
            division_id: noodleDivision.id
          })
        
        console.log(`Assigned user ${userId} to Noodle division`)
      }
    }
  } catch (error) {
    console.error('Error calculating user points:', error)
    // Don't throw to prevent webhook failure
  }
}