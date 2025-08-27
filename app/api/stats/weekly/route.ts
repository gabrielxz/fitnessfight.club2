import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current week start (Monday)
    const now = new Date()
    const currentWeekStart = new Date(now)
    currentWeekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))
    currentWeekStart.setHours(0, 0, 0, 0)

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

    return NextResponse.json({
      currentWeekHours,
      lastWeekHours,
      activityCount: currentWeekActivities?.length || 0,
      totalDistance
    })
  } catch (error) {
    console.error('Error fetching weekly stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}