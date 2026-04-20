import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeMetricScores, type MetricKey, type ActivityRow } from '@/lib/rivalries/metrics'
import { rivalryTodayStr, periodStartUTC, periodEndUTC } from '@/lib/rivalries/time-window'

interface MatchupWithStats {
  id: string
  player1: { user_id: string; name: string; avatar: string | null; kill_marks: number; metric_value: number }
  player2: { user_id: string; name: string; avatar: string | null; kill_marks: number; metric_value: number }
  winner_id: string | null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // All rivalry periods (for season schedule display)
    const { data: allPeriods } = await supabase
      .from('rivalry_periods')
      .select('*')
      .order('period_number', { ascending: true })

    if (!allPeriods || allPeriods.length === 0) {
      return NextResponse.json({
        all_periods: [],
        current_period: null,
        matchups: [],
        current_user_id: user?.id ?? null,
      })
    }

    // Find current active period (using PT-anchored "today")
    const today = rivalryTodayStr()
    const currentPeriod = allPeriods.find(
      p => p.start_date <= today && p.end_date >= today
    ) ?? null

    if (!currentPeriod) {
      return NextResponse.json({
        all_periods: allPeriods,
        current_period: null,
        matchups: [],
        current_user_id: user?.id ?? null,
      })
    }

    // Matchups for current period
    const { data: rawMatchups } = await supabase
      .from('rivalry_matchups')
      .select('id, player1_id, player2_id, winner_id')
      .eq('period_id', currentPeriod.id)

    if (!rawMatchups || rawMatchups.length === 0) {
      return NextResponse.json({
        all_periods: allPeriods,
        current_period: currentPeriod,
        matchups: [],
        current_user_id: user?.id ?? null,
      })
    }

    // Collect all involved player IDs
    const involvedIds = Array.from(new Set(rawMatchups.flatMap(m => [m.player1_id, m.player2_id])))

    // Get names and avatars
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', involvedIds)

    const { data: stravaConns } = await supabase
      .from('strava_connections')
      .select('user_id, strava_firstname, strava_lastname, strava_profile')
      .in('user_id', involvedIds)

    // Kill marks per player (all-time wins)
    const { data: allWins } = await supabase
      .from('rivalry_matchups')
      .select('winner_id')
      .in('winner_id', involvedIds)

    const killMarksByUser: Record<string, number> = {}
    for (const row of allWins || []) {
      if (row.winner_id) killMarksByUser[row.winner_id] = (killMarksByUser[row.winner_id] || 0) + 1
    }

    // Live metric stats from strava_activities for the current period date range
    const metric = currentPeriod.metric as MetricKey
    const { data: activities } = await supabase
      .from('strava_activities')
      .select('user_id, sport_type, distance, moving_time, total_elevation_gain, start_date')
      .in('user_id', involvedIds)
      .gte('start_date', periodStartUTC(currentPeriod.start_date))
      .lt('start_date', periodEndUTC(currentPeriod.end_date))
      .is('deleted_at', null)

    const metricByUser = computeMetricScores((activities ?? []) as ActivityRow[], metric)

    // Helper to build player info
    function buildPlayer(userId: string) {
      const profile = profiles?.find(p => p.id === userId)
      const conn = stravaConns?.find(c => c.user_id === userId)
      const stravaName = conn ? `${conn.strava_firstname || ''} ${conn.strava_lastname || ''}`.trim() : null
      const name = stravaName || profile?.full_name || profile?.email?.split('@')[0] || `User ${userId.slice(0, 8)}`

      // computeMetricScores already returns values in display units
      const metricValue = metricByUser[userId] ?? 0

      return {
        user_id: userId,
        name,
        avatar: conn?.strava_profile ?? null,
        kill_marks: killMarksByUser[userId] ?? 0,
        metric_value: Math.round(metricValue * 100) / 100,
      }
    }

    const matchups: MatchupWithStats[] = rawMatchups.map(m => ({
      id: m.id,
      player1: buildPlayer(m.player1_id),
      player2: buildPlayer(m.player2_id),
      winner_id: m.winner_id,
    }))

    // Sort: current user's matchup first
    if (user) {
      matchups.sort((a, b) => {
        const aHasUser = a.player1.user_id === user.id || a.player2.user_id === user.id ? -1 : 1
        const bHasUser = b.player1.user_id === user.id || b.player2.user_id === user.id ? -1 : 1
        return aHasUser - bHasUser
      })
    }

    return NextResponse.json({
      all_periods: allPeriods,
      current_period: currentPeriod,
      matchups,
      current_user_id: user?.id ?? null,
    })
  } catch (error) {
    console.error('Error fetching rivalries:', error)
    return NextResponse.json({ error: 'Failed to fetch rivalries' }, { status: 500 })
  }
}
