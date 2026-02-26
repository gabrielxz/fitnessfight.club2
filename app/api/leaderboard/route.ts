import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekBoundaries } from '@/lib/date-helpers'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Fetch all user profiles with cumulative points breakdown
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, timezone, total_cumulative_points, cumulative_exercise_points, cumulative_habit_points, cumulative_badge_points')

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ leaderboard: [], current_period: null, current_user_id: user?.id ?? null })
    }

    const userIds = profiles.map(p => p.id)

    // Fetch strava connections for avatar URLs and names
    const { data: stravaConnections } = await supabase
      .from('strava_connections')
      .select('user_id, strava_firstname, strava_lastname, strava_profile')
      .in('user_id', userIds)

    // Fetch badges for all users
    const { data: userBadges } = await supabase
      .from('user_badges')
      .select('user_id, tier, badge:badges(emoji, name)')
      .in('user_id', userIds)

    // Fetch current week hours (timezone-aware)
    const now = new Date()
    const userWeekStarts = new Map<string, string>()
    const distinctWeekStarts = new Set<string>()

    for (const profile of profiles) {
      const tz = profile.timezone || 'America/New_York'
      const { weekStart } = getWeekBoundaries(now, tz)
      const weekStartStr = weekStart.toISOString().split('T')[0]
      userWeekStarts.set(profile.id, weekStartStr)
      distinctWeekStarts.add(weekStartStr)
    }

    const { data: weeklyRows } = await supabase
      .from('weekly_exercise_tracking')
      .select('user_id, week_start, hours_logged')
      .in('user_id', userIds)
      .in('week_start', Array.from(distinctWeekStarts))

    // Rivalry data — gracefully skip if tables don't exist yet
    let currentPeriod: {
      id: string
      metric: string
      metric_label: string
      metric_unit: string
      start_date: string
      end_date: string
      period_number: number
    } | null = null
    let currentMatchups: { player1_id: string; player2_id: string; winner_id: string | null }[] = []
    let killMarksByUser: Record<string, number> = {}

    try {
      const today = now.toISOString().split('T')[0]

      const { data: period } = await supabase
        .from('rivalry_periods')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today)
        .single()

      if (period) {
        currentPeriod = period

        const { data: matchups } = await supabase
          .from('rivalry_matchups')
          .select('player1_id, player2_id, winner_id')
          .eq('period_id', period.id)

        currentMatchups = matchups || []
      }

      // Kill marks: total wins ever (excluding ties)
      const { data: allWins } = await supabase
        .from('rivalry_matchups')
        .select('winner_id')
        .not('winner_id', 'is', null)

      for (const row of allWins || []) {
        if (row.winner_id) {
          killMarksByUser[row.winner_id] = (killMarksByUser[row.winner_id] || 0) + 1
        }
      }
    } catch {
      // Rivalry tables not yet migrated — degrade gracefully
    }

    // Build a lookup of rival per user for the current period
    const rivalByUser = new Map<string, string>()
    for (const matchup of currentMatchups) {
      rivalByUser.set(matchup.player1_id, matchup.player2_id)
      rivalByUser.set(matchup.player2_id, matchup.player1_id)
    }

    // Build full leaderboard
    const leaderboard = profiles.map(profile => {
      const connection = stravaConnections?.find(c => c.user_id === profile.id)
      const stravaName = connection
        ? `${connection.strava_firstname || ''} ${connection.strava_lastname || ''}`.trim()
        : null
      const name = stravaName || profile.full_name || profile.email?.split('@')[0] || `User ${profile.id.slice(0, 8)}`

      const badges = (userBadges || [])
        .filter(b => b.user_id === profile.id)
        .map(b => ({
          emoji: (b.badge as { emoji?: string; name?: string })?.emoji ?? '',
          name: (b.badge as { emoji?: string; name?: string })?.name ?? '',
          tier: b.tier as 'gold' | 'silver' | 'bronze',
        }))

      const weekStartStr = userWeekStarts.get(profile.id)
      const thisWeekHours = weeklyRows?.find(
        w => w.user_id === profile.id && w.week_start === weekStartStr
      )?.hours_logged ?? 0

      const rivalUserId = rivalByUser.get(profile.id) ?? null
      const killMarks = killMarksByUser[profile.id] ?? 0
      const totalPoints = profile.total_cumulative_points ?? 0
      // Each kill mark adds 1% — multiply, then round to 1 decimal
      const adjustedPoints = Math.round(totalPoints * (1 + killMarks * 0.01) * 10) / 10

      return {
        user_id: profile.id,
        name,
        avatar: connection?.strava_profile ?? null,
        total_points: totalPoints,
        adjusted_points: adjustedPoints,
        exercise_points: profile.cumulative_exercise_points ?? 0,
        habit_points: profile.cumulative_habit_points ?? 0,
        badge_points: profile.cumulative_badge_points ?? 0,
        this_week_hours: thisWeekHours,
        badges,
        kill_marks: killMarks,
        rival_user_id: rivalUserId,
      }
    })

    // Sort by adjusted points (kill mark multiplier applied), name as tiebreaker
    leaderboard.sort((a, b) => b.adjusted_points - a.adjusted_points || a.name.localeCompare(b.name))

    // Add rank and resolve rival names
    const nameByUserId = new Map(leaderboard.map((e, i) => [e.user_id, e.name]))
    const rankByUserId = new Map(leaderboard.map((e, i) => [e.user_id, i + 1]))

    const ranked = leaderboard.map((entry, i) => ({
      ...entry,
      rank: i + 1,
      rival: entry.rival_user_id
        ? {
            user_id: entry.rival_user_id,
            name: nameByUserId.get(entry.rival_user_id) ?? 'Unknown',
            rank: rankByUserId.get(entry.rival_user_id) ?? null,
          }
        : null,
    }))

    return NextResponse.json({
      leaderboard: ranked,
      current_period: currentPeriod,
      current_user_id: user?.id ?? null,
    })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
