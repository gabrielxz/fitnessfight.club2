import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BadgeCalculator } from '@/lib/badges/BadgeCalculator'

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
    
    // Recalculate points for the week this activity belongs to
    const weekStart = getWeekStart(new Date(activity.start_date))
    await recalculateWeeklyPoints(connection.user_id, weekStart, supabase)

    // Calculate badges for this activity
    const badgeCalculator = new BadgeCalculator(supabase)
    await badgeCalculator.calculateBadgesForActivity({
      strava_activity_id: activity.id,
      user_id: connection.user_id,
      start_date_local: activity.start_date_local,
      distance: activity.distance,
      moving_time: activity.moving_time,
      calories: activity.calories,
      total_elevation_gain: activity.total_elevation_gain,
      average_speed: activity.average_speed,
      type: activity.type,
      sport_type: activity.sport_type
    })
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
  // If Sunday (0), treat as end of week (day 7)
  const adjustedDay = day === 0 ? 7 : day
  // Calculate days back to Monday (1)
  const diff = d.getUTCDate() - (adjustedDay - 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart)
  end.setUTCDate(end.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return end
}

// Recalculate all points for a user for a given week
// Note: Webhook calls this once per activity, so we always update cumulative points
// Unlike sync which processes multiple activities at once
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
    
    // Calculate total hours and points for this week
    const totalHours = activities.reduce((sum, activity) => sum + (activity.moving_time / 3600), 0)
    const weeklyExercisePoints = Math.min(totalHours, 10) // Cap at 10 points per week
    
    // Get existing points for this week to calculate the difference
    const { data: existingWeekPoints } = await supabase
      .from('user_points')
      .select('id, total_points')
      .eq('user_id', userId)
      .eq('week_start', weekStart.toISOString().split('T')[0])
      .single()
    
    const previousWeekPoints = existingWeekPoints?.total_points || 0
    const pointsDifference = weeklyExercisePoints - previousWeekPoints
    
    // Update or insert user_points record for weekly tracking
    if (existingWeekPoints) {
      await supabase
        .from('user_points')
        .update({
          total_hours: totalHours,
          total_points: weeklyExercisePoints,
          activities_count: activities.length,
          last_activity_at: activities.length > 0 ? activities[activities.length - 1].start_date : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingWeekPoints.id)
    } else if (activities.length > 0) {
      await supabase
        .from('user_points')
        .insert({
          user_id: userId,
          week_start: weekStart.toISOString().split('T')[0],
          week_end: weekEnd.toISOString().split('T')[0],
          total_hours: totalHours,
          total_points: weeklyExercisePoints,
          activities_count: activities.length,
          last_activity_at: activities[activities.length - 1].start_date
        })
      
    }
    
    // Update cumulative points in user_profiles
    // Webhook processes one activity at a time, so we update cumulative here
    if (pointsDifference !== 0) {
      // Get current cumulative points
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('cumulative_points')
        .eq('id', userId)
        .single()
      
      const currentCumulative = profile?.cumulative_points || 0
      const newCumulative = Math.max(0, currentCumulative + pointsDifference)
      
      // Update cumulative points
      await supabase
        .from('user_profiles')
        .upsert({
          id: userId,
          cumulative_points: newCumulative,
          updated_at: new Date().toISOString()
        })
      
      console.log(`Updated cumulative points for user ${userId}: ${currentCumulative.toFixed(2)} -> ${newCumulative.toFixed(2)} (${pointsDifference > 0 ? '+' : ''}${pointsDifference.toFixed(2)})`)
    }
    
    console.log(`Weekly points for user ${userId}: ${weeklyExercisePoints.toFixed(2)} points (${totalHours.toFixed(2)} hours) from ${activities.length} activities`)
    
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