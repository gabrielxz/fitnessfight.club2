import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekBoundaries } from '@/lib/date-helpers'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const searchParams = request.nextUrl.searchParams
    const divisionId = searchParams.get('divisionId')

    let divisionIdToFetch: string | null = divisionId

    // If no divisionId is provided, and a user is logged in, fetch their division
    if (!divisionIdToFetch && user) {
      const { data: userDivision } = await supabase
        .from('user_divisions')
        .select('division_id')
        .eq('user_id', user.id)
        .single()
      if (userDivision) {
        divisionIdToFetch = userDivision.division_id
      }
    }

    // If still no division, default to the lowest level division for public view
    if (!divisionIdToFetch) {
      const { data: lowestDivision } = await supabase
        .from('divisions')
        .select('id')
        .order('level', { ascending: true })
        .limit(1)
        .single()
      if (lowestDivision) {
        divisionIdToFetch = lowestDivision.id
      }
    }

    if (!divisionIdToFetch) {
      return NextResponse.json({ error: 'No divisions found' }, { status: 404 })
    }

    // Fetch division details
    const { data: division } = await supabase
      .from('divisions')
      .select('*')
      .eq('id', divisionIdToFetch)
      .single()

    if (!division) {
      return NextResponse.json({ error: 'Division not found' }, { status: 404 })
    }

    // Get all users in the specified division
    const { data: divisionUsers } = await supabase
      .from('user_divisions')
      .select('user_id')
      .eq('division_id', divisionIdToFetch)

    const userIds = divisionUsers?.map(u => u.user_id) || []

    if (userIds.length === 0) {
      // No users in this division, return an empty leaderboard
      return NextResponse.json({
        division,
        position: 0,
        totalInDivision: 0,
        zone: 'safe',
        leaderboard: [],
        currentUser: null
      })
    }

    // Get profile info with timezone and cumulative points for all users in the division
    const { data: userProfilesRaw } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, timezone, total_cumulative_points')
      .in('id', userIds)
    type ProfileRow = {
      id: string
      full_name: string | null
      email: string | null
      timezone: string | null
      total_cumulative_points: number | null
    }
    const userProfiles: ProfileRow[] = (userProfilesRaw || []) as ProfileRow[]

    // Get Strava connections for all users in the division
    const { data: stravaConnections } = await supabase
      .from('strava_connections')
      .select('user_id, strava_firstname, strava_lastname, strava_profile')
      .in('user_id', userIds)

    // Get badges for all users in the division
    const { data: userBadges } = await supabase
      .from('user_badges')
      .select('user_id, tier, badge:badges(emoji, name)')
      .in('user_id', userIds)

    // Compute each user's current week_start (timezone-aware), then fetch matching weekly rows
    const now = new Date()
    const userWeekStarts = new Map<string, string>()
    const distinctWeekStarts = new Set<string>()

    for (const profile of userProfiles || []) {
      const tz = profile.timezone || 'America/New_York'
      const { weekStart } = getWeekBoundaries(now, tz)
      const weekStartStr = weekStart.toISOString().split('T')[0]
      userWeekStarts.set(profile.id, weekStartStr)
      distinctWeekStarts.add(weekStartStr)
    }

    let weeklyExercise: { user_id: string; week_start: string; hours_logged: number }[] = []
    if (userIds.length > 0 && distinctWeekStarts.size > 0) {
      const { data: weeklyRows } = await supabase
        .from('weekly_exercise_tracking')
        .select('user_id, week_start, hours_logged')
        .in('user_id', userIds)
        .in('week_start', Array.from(distinctWeekStarts))
      weeklyExercise = weeklyRows || []
    }

    // Combine all data into a leaderboard
    const leaderboard = userProfiles?.map(profile => {
      const connection = stravaConnections?.find(c => c.user_id === profile.id)
      const badges = userBadges?.filter(b => b.user_id === profile.id)
        .map(b => ({
          emoji: (b.badge as { emoji?: string; name?: string })?.emoji,
          name: (b.badge as { emoji?: string; name?: string })?.name,
          tier: b.tier,
        })) || []

      const stravaName = connection
        ? `${connection.strava_firstname || ''} ${connection.strava_lastname || ''}`.trim()
        : null

      const targetWeek = userWeekStarts.get(profile.id)
      const weeklyHours = weeklyExercise?.find(w => w.user_id === profile.id && w.week_start === targetWeek)?.hours_logged || 0

      return {
        user_id: profile.id,
        name: stravaName || profile.full_name || profile.email?.split('@')[0] || `User ${profile.id.substring(0, 8)}`,
        strava_profile: connection?.strava_profile,
        total_points: profile.total_cumulative_points || 0,
        total_hours: weeklyHours,
        badges,
      }
    }) || []
    
    // Sort by cumulative points descending
    leaderboard.sort((a, b) => b.total_points - a.total_points)

    const position = user ? leaderboard.findIndex(u => u.user_id === user.id) + 1 : 0
    const totalInDivision = leaderboard.length

    let zone = 'safe'
    if (user && position === 1 && division.level < 4) {
      zone = 'promotion'
    } else if (user && position === totalInDivision && totalInDivision > 1 && division.level > 1) {
      zone = 'relegation'
    }

    return NextResponse.json({
      division,
      position,
      totalInDivision,
      zone,
      leaderboard,
      currentUser: user ? {
        id: user.id,
        points: leaderboard.find(u => u.user_id === user.id)?.total_points || 0,
      } : null
    })

  } catch (error) {
    console.error('Error fetching division data:', error)
    return NextResponse.json({ error: 'Failed to fetch division data' }, { status: 500 })
  }
}
