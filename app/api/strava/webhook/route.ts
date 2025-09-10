import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BadgeCalculator } from '@/lib/badges/BadgeCalculator'
import { getWeekBoundaries } from '@/lib/date-helpers'

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
      // Get the user's connection and profile to find their timezone
      const { data: connection, error: connError } = await supabase
        .from('strava_connections')
        .select('*, user_profiles(timezone)')
        .eq('strava_athlete_id', owner_id)
        .single()

      if (connError || !connection) {
        console.log(`No connection or profile found for athlete ${owner_id}`)
        return NextResponse.json({ status: 'ok' })
      }
      
      const userTimezone = connection.user_profiles?.timezone || 'UTC'

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

      let activityDate = new Date()

      switch (aspect_type) {
        case 'create':
        case 'update':
          const activity = await fetchAndStoreActivity(object_id, connection, supabase)
          if (activity) {
            activityDate = new Date(activity.start_date_local)
          }
          break
        case 'delete':
          const deletedActivity = await deleteActivity(object_id, supabase)
          if (deletedActivity) {
            activityDate = new Date(deletedActivity.start_date_local)
          }
          break
      }
      
      // Always recalculate points for the affected week
      await recalculateAllWeeklyPoints(connection.user_id, activityDate, userTimezone, supabase)
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
    const { data, error: dbError } = await supabase
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
      .select()
      .single()
    
    if (dbError) {
      console.error(`Database error storing activity ${activityId}:`, dbError)
      throw dbError
    }

    console.log(`Activity ${activityId} stored successfully in database`)
    
    // Calculate badges for this activity
    const badgeCalculator = new BadgeCalculator(supabase)
    await badgeCalculator.calculateBadgesForActivity(data)
    
    return data

  } catch (error) {
    console.error(`Error fetching/storing activity ${activityId}:`, error)
    throw error
  }
}

async function deleteActivity(activityId: number, supabase: SupabaseClient) {
  try {
    // Soft delete the activity and return it to get the date for recalculation
    const { data, error } = await supabase
      .from('strava_activities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('strava_activity_id', activityId)
      .select()
      .single()

    if (error) throw error

    console.log(`Activity ${activityId} marked as deleted`)
    return data
  } catch (error) {
    console.error(`Error deleting activity ${activityId}:`, error)
    throw error
  }
}

// Recalculates all points for a user for a given week based on a date within that week.
async function recalculateAllWeeklyPoints(
  userId: string,
  dateInWeek: Date,
  timezone: string,
  supabase: SupabaseClient
) {
  try {
    const { weekStart, weekEnd } = getWeekBoundaries(dateInWeek, timezone)
    
    // 1. Calculate Exercise Points
    const { data: activities, error: activitiesError } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', userId)
      .gte('start_date', weekStart.toISOString())
      .lte('start_date', weekEnd.toISOString())
      .is('deleted_at', null)
    
    if (activitiesError) throw activitiesError
    
    const totalHours = activities.reduce((sum, a) => sum + (a.moving_time / 3600), 0)
    const exercisePoints = Math.min(totalHours, 10)

    // 2. Calculate Habit Points
    const { data: summaries, error: habitsError } = await supabase
      .from('habit_weekly_summaries')
      .select('successes, target')
      .eq('user_id', userId)
      .eq('week_start', weekStart.toISOString().split('T')[0])

    if (habitsError) throw habitsError

    const completedHabits = summaries.filter(h => h.successes >= h.target).length
    const habitPoints = Math.min(completedHabits * 0.5, 2.5)

    // 3. Calculate Badge Points for the week
    // Note: This is a simplified model. A full implementation might need to
    // query user_badges earned within the week's boundaries.
    // For now, we assume badge points are handled by another process or
    // are not included in the weekly leaderboard score directly.
    const badgePoints = 0; // Placeholder

    // 4. Upsert the unified user_points record
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const { error: upsertError } = await supabase
      .from('user_points')
      .upsert({
        user_id: userId,
        week_start: weekStartStr,
        week_end: weekEndStr,
        exercise_points: exercisePoints,
        habit_points: habitPoints,
        badge_points: badgePoints, // Will be updated by badge logic
        total_hours: totalHours,
        activities_count: activities.length,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, week_start'
      })

    if (upsertError) throw upsertError

    console.log(`Recalculated points for user ${userId} for week starting ${weekStartStr}: Exercise=${exercisePoints.toFixed(2)}, Habit=${habitPoints.toFixed(2)}`)

    // 5. Ensure user has a division assignment (idempotent)
    await ensureDivisionAssignment(userId, supabase)

  } catch (error) {
    console.error(`Error calculating all weekly points for user ${userId}:`, error)
  }
}

async function ensureDivisionAssignment(userId: string, supabase: SupabaseClient) {
  const { data: userDivision } = await supabase
    .from('user_divisions')
    .select('id')
    .eq('user_id', userId)
    .single()
  
  if (!userDivision) {
    const { data: noodleDivision } = await supabase
      .from('divisions')
      .select('id')
      .eq('name', 'Noodle')
      .single()
    
    if (noodleDivision) {
      await supabase
        .from('user_divisions')
        .insert({ user_id: userId, division_id: noodleDivision.id })
      console.log(`Assigned user ${userId} to Noodle division`)
    }
  }
}