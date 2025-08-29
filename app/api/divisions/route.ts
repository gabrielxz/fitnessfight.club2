import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper functions for week calculations
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day
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

    // Get all users in the division with their points and Strava info
    const { data: divisionUsers } = await supabase
      .from('user_divisions')
      .select(`
        user_id,
        strava_connections!left(
          strava_firstname,
          strava_lastname,
          strava_profile
        )
      `)
      .eq('division_id', divisionIdToFetch)

    // Get points for all users in the division
    const userIds = divisionUsers?.map(u => u.user_id) || []
    const { data: userPoints } = await supabase
      .from('user_points')
      .select('user_id, total_points, total_hours')
      .in('user_id', userIds)
      .eq('week_start', weekStartStr)

    // Combine user data with points
    const leaderboard = divisionUsers?.map(divUser => {
      const points = userPoints?.find(p => p.user_id === divUser.user_id)
      const connections = divUser.strava_connections as unknown as Array<{
        strava_firstname: string | null
        strava_lastname: string | null  
        strava_profile: string | null
      }>
      const connection = connections?.[0]
      
      return {
        user_id: divUser.user_id,
        name: connection
          ? `${connection.strava_firstname || ''} ${connection.strava_lastname || ''}`
          : 'Anonymous',
        strava_profile: connection?.strava_profile,
        total_points: points?.total_points || 0,
        total_hours: points?.total_hours || 0,
        badges: [],
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