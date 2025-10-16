import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekBoundaries } from '@/lib/date-helpers'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve user timezone
    let timezone = 'America/New_York'
    const { data: profileTz } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', user.id)
      .single()
    if (profileTz?.timezone) timezone = profileTz.timezone

    // Get current and last week boundaries in user timezone
    const now = new Date()
    const { weekStart: currentWeekStart, weekEnd: currentWeekEnd } = getWeekBoundaries(now, timezone)
    const lastWeekAnchor = new Date(currentWeekStart)
    lastWeekAnchor.setUTCDate(lastWeekAnchor.getUTCDate() - 1) // go to previous week
    const { weekStart: lastWeekStart, weekEnd: lastWeekEnd } = getWeekBoundaries(lastWeekAnchor, timezone)

    // Fetch current week activities
    const { data: currentWeekActivities } = await supabase
      .from('strava_activities')
      .select('moving_time, distance')
      .eq('user_id', user.id)
      .gte('start_date', currentWeekStart.toISOString())
      .lte('start_date', currentWeekEnd.toISOString())
      .is('deleted_at', null)

    // Fetch last week activities
    const { data: lastWeekActivities } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', user.id)
      .gte('start_date', lastWeekStart.toISOString())
      .lte('start_date', lastWeekEnd.toISOString())
      .is('deleted_at', null)

    // Calculate stats
    const currentWeekHours = (currentWeekActivities || []).reduce(
      (sum, activity) => sum + (activity.moving_time || 0), 
      0
    ) / 3600

    const lastWeekHours = (lastWeekActivities || []).reduce(
      (sum, activity) => sum + (activity.moving_time || 0), 
      0
    ) / 3600

    const totalDistance = (currentWeekActivities || []).reduce(
      (sum, activity) => sum + (activity.distance || 0), 
      0
    ) / 1000 // Convert to km

    // Get total cumulative points from user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('total_cumulative_points')
      .eq('id', user.id)
      .single()

    // Get weekly tracked hours for both weeks (timezone-aware week_start date)
    const currentWeekStartStr = currentWeekStart.toISOString().split('T')[0]
    const lastWeekStartStr = lastWeekStart.toISOString().split('T')[0]

    const { data: currentWeekRow } = await supabase
      .from('weekly_exercise_tracking')
      .select('hours_logged')
      .eq('user_id', user.id)
      .eq('week_start', currentWeekStartStr)
      .single()

    const { data: lastWeekRow } = await supabase
      .from('weekly_exercise_tracking')
      .select('hours_logged')
      .eq('user_id', user.id)
      .eq('week_start', lastWeekStartStr)
      .single()

    return NextResponse.json({
      currentWeekHours: currentWeekRow?.hours_logged ?? currentWeekHours,
      lastWeekHours: lastWeekRow?.hours_logged ?? lastWeekHours,
      cumulativePoints: profile?.total_cumulative_points || 0,  // Total lifetime points
      activityCount: currentWeekActivities?.length || 0,
      totalDistance
    })
  } catch (error) {
    console.error('Error fetching weekly stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
