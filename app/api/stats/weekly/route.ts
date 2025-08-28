import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current week start (Sunday in UTC)
    const now = new Date()
    const day = now.getUTCDay()
    const diff = now.getUTCDate() - day
    const currentWeekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0, 0))

    // Get last week start
    const lastWeekStart = new Date(currentWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(currentWeekStart)

    // Fetch current week activities
    const { data: currentWeekActivities } = await supabase
      .from('strava_activities')
      .select('moving_time, distance')
      .eq('user_id', user.id)
      .gte('start_date', currentWeekStart.toISOString())
      .is('deleted_at', null)

    // Fetch last week activities
    const { data: lastWeekActivities } = await supabase
      .from('strava_activities')
      .select('moving_time')
      .eq('user_id', user.id)
      .gte('start_date', lastWeekStart.toISOString())
      .lt('start_date', lastWeekEnd.toISOString())
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

    // Get points data for current week
    const currentWeekStartStr = currentWeekStart.toISOString().split('T')[0]
    const lastWeekStartStr = lastWeekStart.toISOString().split('T')[0]
    
    const { data: currentWeekPoints } = await supabase
      .from('user_points')
      .select('total_points, total_hours')
      .eq('user_id', user.id)
      .eq('week_start', currentWeekStartStr)
      .single()
    
    const { data: lastWeekPoints } = await supabase
      .from('user_points')
      .select('total_points')
      .eq('user_id', user.id)
      .eq('week_start', lastWeekStartStr)
      .single()

    return NextResponse.json({
      currentWeekHours: currentWeekPoints?.total_hours || currentWeekHours,
      lastWeekHours,
      currentWeekPoints: currentWeekPoints?.total_points || Math.min(currentWeekHours, 10),
      lastWeekPoints: lastWeekPoints?.total_points || Math.min(lastWeekHours, 10),
      activityCount: currentWeekActivities?.length || 0,
      totalDistance
    })
  } catch (error) {
    console.error('Error fetching weekly stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}