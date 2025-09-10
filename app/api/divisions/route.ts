import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const searchParams = request.nextUrl.searchParams
    const divisionId = searchParams.get('divisionId')

    let divisionIdToFetch: string | null = divisionId

    if (!divisionIdToFetch && user) {
      // If no divisionId is provided, fetch the user's division
      const { data: userDivision } = await supabase
        .from('user_divisions')
        .select('division_id')
        .eq('user_id', user.id)
        .single()
      if (userDivision) {
        divisionIdToFetch = userDivision.division_id
      }
    }

    if (!divisionIdToFetch) {
      // If still no divisionId, we can default to the first division or handle as an error
      // For a public leaderboard, let's default to the lowest level division
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

    // Get current week
    const weekStart = getWeekStart(new Date())
    const weekStartStr = weekStart.toISOString().split('T')[0]

    // Get all users in the division
    const { data: divisionUsers } = await supabase
      .from('user_divisions')
      .select('user_id')
      .eq('division_id', divisionIdToFetch)

    // Get user IDs for batch queries
    const userIds = divisionUsers?.map(u => u.user_id) || []
    
    // Get profile info from user_profiles
    const { data: userProfiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    
    // Get weekly points and hours from user_points
    const { data: userWeeklyData } = await supabase
      .from('user_points')
      .select('user_id, total_points, total_hours')
      .in('user_id', userIds)
      .eq('week_start', weekStartStr)
    
    const profileMap = new Map(
      userProfiles?.map(p => [
        p.id,
        {
          name: p.full_name || p.email?.split('@')[0] || null
        }
      ]) || []
    )

    // Get Strava connections for all users
    const { data: stravaConnections } = await supabase
      .from('strava_connections')
      .select('user_id, strava_firstname, strava_lastname, strava_profile')
      .in('user_id', userIds)

    // Get badges for all users
    const { data: userBadges } = await supabase
      .from('user_badges')
      .select(`
        user_id,
        tier,
        badge:badges(emoji, name)
      `)
      .in('user_id', userIds)

    // Combine all data
    const leaderboard = divisionUsers?.map(divUser => {
      const weeklyData = userWeeklyData?.find(p => p.user_id === divUser.user_id)
      const connection = stravaConnections?.find(c => c.user_id === divUser.user_id)
      const badges = userBadges?.filter(b => b.user_id === divUser.user_id)
        .map(b => ({
          emoji: (b.badge as { emoji?: string; name?: string })?.emoji,
          name: (b.badge as { emoji?: string; name?: string })?.name,
          tier: b.tier,
        })) || []
      
      const profile = profileMap.get(divUser.user_id)
      const stravaName = connection
        ? `${connection.strava_firstname || ''} ${connection.strava_lastname || ''}`.trim()
        : null
      
      return {
        user_id: divUser.user_id,
        name: stravaName || profile?.name || `User ${divUser.user_id.substring(0, 8)}`,
        strava_profile: connection?.strava_profile,
        total_points: weeklyData?.total_points || 0,    // Use weekly points from user_points
        total_hours: weeklyData?.total_hours || 0,      // Weekly hours for display
        badges,
        has_strava: !!connection,
      }
    }) || []
    
    // Sort by points descending
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
        hours: leaderboard.find(u => u.user_id === user.id)?.total_hours || 0
      } : null
    })

  } catch (error) {
    console.error('Error fetching division data:', error)
    return NextResponse.json({ error: 'Failed to fetch division data' }, { status: 500 })
  }
}