import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper functions for week calculations
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get user's current division
    let { data: userDivision } = await supabase
      .from('user_divisions')
      .select('*, division:divisions(*)')
      .eq('user_id', user.id)
      .single()
    
    if (!userDivision) {
      // Assign to Noodle division if not assigned
      const { data: noodleDivision } = await supabase
        .from('divisions')
        .select('id')
        .eq('name', 'Noodle')
        .single()
      
      if (noodleDivision) {
        const { data: newUserDivision } = await supabase
          .from('user_divisions')
          .insert({
            user_id: user.id,
            division_id: noodleDivision.id
          })
          .select('*, division:divisions(*)')
          .single()
        
        userDivision = newUserDivision
      }
      
      if (!userDivision) {
        return NextResponse.json({ 
          error: 'Failed to assign division',
          division: null,
          newUser: true 
        }, { status: 500 })
      }
    }
    
    // Get current week
    const weekStart = getWeekStart(new Date())
    const weekStartStr = weekStart.toISOString().split('T')[0]
    
    // Get all users in the same division with their points and Strava info
    const { data: divisionUsers } = await supabase
      .from('user_divisions')
      .select(`
        user_id,
        strava_connections!inner(
          strava_firstname,
          strava_lastname,
          strava_profile
        ),
        user_badges!left(
          tier,
          badge:badges(emoji, name)
        )
      `)
      .eq('division_id', userDivision.division_id)
    
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
      
      const badges = (divUser.user_badges as any)?.map((b: any) => ({
        emoji: b.badge.emoji,
        name: b.badge.name,
        tier: b.tier,
      })) || []

      return {
        user_id: divUser.user_id,
        name: connection
          ? `${connection.strava_firstname || ''} ${connection.strava_lastname || ''}`
          : 'Anonymous',
        strava_profile: connection?.strava_profile,
        total_points: points?.total_points || 0,
        total_hours: points?.total_hours || 0,
        badges,
      }
    }) || []
    
    // Sort by points descending
    leaderboard.sort((a, b) => b.total_points - a.total_points)
    
    // Find user's position
    const position = leaderboard.findIndex(u => u.user_id === user.id) + 1
    const totalInDivision = leaderboard.length
    
    // Determine zone (top 1 promotes, bottom 1 relegates)
    let zone = 'safe'
    if (position === 1 && userDivision.division.level < 4) {
      zone = 'promotion'
    } else if (position === totalInDivision && totalInDivision > 1 && userDivision.division.level > 1) {
      zone = 'relegation'
    }
    
    return NextResponse.json({
      division: userDivision.division,
      position,
      totalInDivision,
      zone,
      leaderboard,
      currentUser: {
        id: user.id,
        points: leaderboard.find(u => u.user_id === user.id)?.total_points || 0,
        hours: leaderboard.find(u => u.user_id === user.id)?.total_hours || 0
      }
    })
  } catch (error) {
    console.error('Error fetching division data:', error)
    return NextResponse.json({ error: 'Failed to fetch division data' }, { status: 500 })
  }
}