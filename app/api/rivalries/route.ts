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

interface HistoryEntry {
  matchup_id: string
  period: {
    id: string
    period_number: number
    metric: string
    metric_label: string
    metric_unit: string
    start_date: string
    end_date: string
  }
  you: {
    user_id: string
    name: string
    avatar: string | null
    score: number
  }
  opponent: {
    user_id: string
    name: string
    avatar: string | null
    score: number
  }
  winner_id: string | null
  outcome: 'win' | 'loss' | 'tie'
  kill_marks_at_close: number
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
        my_history: [],
        unacknowledged_result: null,
        current_user_id: user?.id ?? null,
      })
    }

    // Find current active period (using PT-anchored "today")
    const today = rivalryTodayStr()
    const currentPeriod = allPeriods.find(
      p => p.start_date <= today && p.end_date >= today
    ) ?? null

    // Matchups for current period
    const { data: rawMatchups } = currentPeriod
      ? await supabase
          .from('rivalry_matchups')
          .select('id, player1_id, player2_id, winner_id')
          .eq('period_id', currentPeriod.id)
      : { data: [] as { id: string; player1_id: string; player2_id: string; winner_id: string | null }[] }

    // User's past matchups (closed periods where the user was a participant).
    // Include viewed_at so we can surface an unacknowledged result.
    let myClosedMatchups: {
      id: string
      period_id: string
      player1_id: string
      player2_id: string
      player1_score: number | null
      player2_score: number | null
      winner_id: string | null
      player1_viewed_at: string | null
      player2_viewed_at: string | null
    }[] = []

    if (user) {
      const { data: closed } = await supabase
        .from('rivalry_matchups')
        .select('id, period_id, player1_id, player2_id, player1_score, player2_score, winner_id, player1_viewed_at, player2_viewed_at')
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        .not('player1_score', 'is', null)

      myClosedMatchups = closed ?? []
    }

    // Collect every user ID we need to resolve: current matchup participants + past opponents
    const involvedIds = new Set<string>()
    for (const m of rawMatchups ?? []) {
      involvedIds.add(m.player1_id)
      involvedIds.add(m.player2_id)
    }
    for (const m of myClosedMatchups) {
      involvedIds.add(m.player1_id)
      involvedIds.add(m.player2_id)
    }
    const involvedIdsArr = Array.from(involvedIds)

    // Names and avatars
    const { data: profiles } = involvedIdsArr.length
      ? await supabase
          .from('user_profiles')
          .select('id, full_name, email')
          .in('id', involvedIdsArr)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] }

    const { data: stravaConns } = involvedIdsArr.length
      ? await supabase
          .from('strava_connections')
          .select('user_id, strava_firstname, strava_lastname, strava_profile')
          .in('user_id', involvedIdsArr)
      : { data: [] as { user_id: string; strava_firstname: string | null; strava_lastname: string | null; strava_profile: string | null }[] }

    function resolveIdentity(userId: string) {
      const profile = profiles?.find(p => p.id === userId)
      const conn = stravaConns?.find(c => c.user_id === userId)
      const stravaName = conn ? `${conn.strava_firstname || ''} ${conn.strava_lastname || ''}`.trim() : null
      const name = stravaName || profile?.full_name || profile?.email?.split('@')[0] || `User ${userId.slice(0, 8)}`
      return { name, avatar: conn?.strava_profile ?? null }
    }

    // Kill marks per involved player (all-time wins)
    let killMarksByUser: Record<string, number> = {}
    if (involvedIdsArr.length) {
      const { data: allWins } = await supabase
        .from('rivalry_matchups')
        .select('winner_id')
        .in('winner_id', involvedIdsArr)

      for (const row of allWins || []) {
        if (row.winner_id) killMarksByUser[row.winner_id] = (killMarksByUser[row.winner_id] || 0) + 1
      }
    }

    // ── Current-period live metric stats ─────────────────────────────────────
    let matchups: MatchupWithStats[] = []
    if (currentPeriod && rawMatchups && rawMatchups.length > 0) {
      const metric = currentPeriod.metric as MetricKey
      const { data: activities } = await supabase
        .from('strava_activities')
        .select('user_id, sport_type, distance, moving_time, total_elevation_gain, start_date')
        .in('user_id', Array.from(new Set(rawMatchups.flatMap(m => [m.player1_id, m.player2_id]))))
        .gte('start_date', periodStartUTC(currentPeriod.start_date))
        .lt('start_date', periodEndUTC(currentPeriod.end_date))
        .is('deleted_at', null)

      const metricByUser = computeMetricScores((activities ?? []) as ActivityRow[], metric)

      function buildPlayer(userId: string) {
        const identity = resolveIdentity(userId)
        const metricValue = metricByUser[userId] ?? 0
        return {
          user_id: userId,
          name: identity.name,
          avatar: identity.avatar,
          kill_marks: killMarksByUser[userId] ?? 0,
          metric_value: Math.round(metricValue * 100) / 100,
        }
      }

      matchups = rawMatchups.map(m => ({
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
    }

    // ── My history + unacknowledged result ───────────────────────────────────
    const periodById = new Map(allPeriods.map(p => [p.id, p]))

    const myHistoryUnsorted: (HistoryEntry & { endDate: string })[] = []
    let unacknowledged: (HistoryEntry & { endDate: string }) | null = null

    if (user) {
      // Compute chronological kill-mark counts so the modal can say
      // "You're now at N kill marks." Order wins by period end_date, then by
      // created_at as a secondary key if two periods share an end_date.
      const sortedWins = [...myClosedMatchups]
        .filter(m => m.winner_id === user.id)
        .sort((a, b) => {
          const pa = periodById.get(a.period_id)
          const pb = periodById.get(b.period_id)
          const ea = pa?.end_date ?? ''
          const eb = pb?.end_date ?? ''
          return ea.localeCompare(eb) || a.id.localeCompare(b.id)
        })

      const killMarksAfterMatchup = new Map<string, number>()
      sortedWins.forEach((m, i) => killMarksAfterMatchup.set(m.id, i + 1))

      for (const m of myClosedMatchups) {
        const period = periodById.get(m.period_id)
        if (!period) continue

        const isPlayer1 = m.player1_id === user.id
        const myScore = (isPlayer1 ? m.player1_score : m.player2_score) ?? 0
        const oppId = isPlayer1 ? m.player2_id : m.player1_id
        const oppScore = (isPlayer1 ? m.player2_score : m.player1_score) ?? 0
        const myViewedAt = isPlayer1 ? m.player1_viewed_at : m.player2_viewed_at

        let outcome: 'win' | 'loss' | 'tie'
        if (m.winner_id === null) outcome = 'tie'
        else if (m.winner_id === user.id) outcome = 'win'
        else outcome = 'loss'

        const myIdentity = resolveIdentity(user.id)
        const oppIdentity = resolveIdentity(oppId)

        const entry: HistoryEntry & { endDate: string } = {
          matchup_id: m.id,
          period: {
            id: period.id,
            period_number: period.period_number,
            metric: period.metric,
            metric_label: period.metric_label,
            metric_unit: period.metric_unit,
            start_date: period.start_date,
            end_date: period.end_date,
          },
          you: {
            user_id: user.id,
            name: myIdentity.name,
            avatar: myIdentity.avatar,
            score: Math.round(myScore * 100) / 100,
          },
          opponent: {
            user_id: oppId,
            name: oppIdentity.name,
            avatar: oppIdentity.avatar,
            score: Math.round(oppScore * 100) / 100,
          },
          winner_id: m.winner_id,
          outcome,
          kill_marks_at_close: outcome === 'win' ? killMarksAfterMatchup.get(m.id) ?? 0 : killMarksByUser[user.id] ?? 0,
          endDate: period.end_date,
        }

        myHistoryUnsorted.push(entry)

        if (!myViewedAt) {
          if (!unacknowledged || entry.endDate > unacknowledged.endDate) {
            unacknowledged = entry
          }
        }
      }
    }

    // Sort history: most recent first
    const myHistory = myHistoryUnsorted
      .sort((a, b) => b.endDate.localeCompare(a.endDate))
      .map(({ endDate: _endDate, ...rest }) => rest)

    const unacknowledgedResult = unacknowledged
      ? (() => { const { endDate: _e, ...rest } = unacknowledged!; return rest })()
      : null

    return NextResponse.json({
      all_periods: allPeriods,
      current_period: currentPeriod,
      matchups,
      my_history: myHistory,
      unacknowledged_result: unacknowledgedResult,
      current_user_id: user?.id ?? null,
    })
  } catch (error) {
    console.error('Error fetching rivalries:', error)
    return NextResponse.json({ error: 'Failed to fetch rivalries' }, { status: 500 })
  }
}
