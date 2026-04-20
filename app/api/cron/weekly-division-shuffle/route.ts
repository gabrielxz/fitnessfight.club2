import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BadgeCalculator } from '@/lib/badges/BadgeCalculator'
import { computePairings, type RankedPlayer, type HistoricalMatchup } from '@/lib/rivalries/pairing'
import { computeMetricScores, type MetricKey, type ActivityRow } from '@/lib/rivalries/metrics'
import { rivalryTodayStr, periodStartUTC, periodEndUTC } from '@/lib/rivalries/time-window'

// Helper to get the start of the *previous* week (Monday)
function getLastWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const adjustedDay = day === 0 ? 7 : day
  const diff = d.getUTCDate() - (adjustedDay - 1) - 7 // Go back 7 more days for last week
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting weekly cron job...')
    const supabase = createAdminClient()

    const now = new Date()
    const lastWeekStart = getLastWeekStart(now)

    // ── Leaderboard snapshot ─────────────────────────────────────────────────
    // Capture current standings before this week's processing so we can
    // track rank changes week-over-week in the competition update generator.
    const dayOfWeek = now.getUTCDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const thisWeekMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday))
    const thisWeekStartStr = thisWeekMonday.toISOString().split('T')[0]

    const { data: profilesForSnapshot } = await supabase
      .from('user_profiles')
      .select('id, total_cumulative_points')
      .order('total_cumulative_points', { ascending: false })

    if (profilesForSnapshot && profilesForSnapshot.length > 0) {
      const snapshots = profilesForSnapshot.map((p, idx) => ({
        user_id: p.id,
        week_start: thisWeekStartStr,
        rank: idx + 1,
        total_points: p.total_cumulative_points ?? 0,
      }))
      await supabase
        .from('leaderboard_snapshots')
        .upsert(snapshots, { onConflict: 'user_id,week_start' })
      console.log(`Captured leaderboard snapshot for ${snapshots.length} users (week ${thisWeekStartStr})`)
    }

    // ── Habit badge evaluation ──────────────────────────────────────────────
    console.log('Evaluating habit badges for last week...')
    const badgeCalculator = new BadgeCalculator(supabase)

    const { data: allHabitUsers } = await supabase
      .from('habits')
      .select('user_id')
      .is('archived_at', null)

    if (allHabitUsers) {
      const uniqueUserIds = [...new Set(allHabitUsers.map(h => h.user_id))]
      console.log(`Evaluating habit badges for ${uniqueUserIds.length} users...`)
      for (const userId of uniqueUserIds) {
        await badgeCalculator.evaluateHabitBadgesForWeek(userId, lastWeekStart)
      }
    }

    // ── Weekly badge progress reset ─────────────────────────────────────────
    const { data: weeklyBadges } = await supabase
      .from('badges')
      .select('id')
      .eq('active', true)
      .eq('criteria->>reset_period', 'weekly')

    if (weeklyBadges && weeklyBadges.length > 0) {
      const badgeIds = weeklyBadges.map(b => b.id)
      await supabase
        .from('badge_progress')
        .update({ last_reset_at: new Date().toISOString() })
        .in('badge_id', badgeIds)
        .lt('period_end', now.toISOString())
      console.log(`Reset progress for ${weeklyBadges.length} weekly badges`)
    }

    // Rivalry "today" in PT terms — drives both close-out detection (which
    // periods have ended) and pairing window (which period is starting).
    const rivalryToday = rivalryTodayStr(now)

    // ── Rivalry pairing ─────────────────────────────────────────────────────
    // Runs BEFORE close-out so that the upcoming period's matchups exist the
    // moment the UI flips to it at midnight PT. Otherwise the page would show
    // the newly-current period with zero matchups for the duration of this
    // cron invocation.
    //
    // Look for a rivalry period whose start_date falls within ±2 days of
    // rivalry-today. The window tolerates cron clock drift; the idempotency
    // guard below prevents double-insertion.
    const rivalryTodayDate = new Date(`${rivalryToday}T00:00:00Z`)
    const windowStart = new Date(rivalryTodayDate); windowStart.setUTCDate(rivalryTodayDate.getUTCDate() - 2)
    const windowEnd   = new Date(rivalryTodayDate); windowEnd.setUTCDate(rivalryTodayDate.getUTCDate() + 2)
    const windowStartStr = windowStart.toISOString().split('T')[0]
    const windowEndStr   = windowEnd.toISOString().split('T')[0]

    const { data: periodRows } = await supabase
      .from('rivalry_periods')
      .select('id, period_number')
      .gte('start_date', windowStartStr)
      .lte('start_date', windowEndStr)
      .order('start_date')
      .limit(1)

    const upcomingPeriod = periodRows?.[0] ?? null

    if (upcomingPeriod) {
      console.log(`Rivalry period ${upcomingPeriod.period_number} starts tomorrow — generating pairings...`)

      // Idempotency guard: skip if pairings already exist for this period
      const { data: existingMatchups } = await supabase
        .from('rivalry_matchups')
        .select('id')
        .eq('period_id', upcomingPeriod.id)
        .limit(1)

      if (existingMatchups && existingMatchups.length > 0) {
        console.log(`Pairings already exist for period ${upcomingPeriod.period_number}, skipping.`)
      } else {
        // Fetch all players sorted by total points descending
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('id, total_cumulative_points')
          .order('total_cumulative_points', { ascending: false })

        // Fetch period numbers for all past periods (for recency calculation)
        const { data: pastPeriods } = await supabase
          .from('rivalry_periods')
          .select('id, period_number')
          .neq('id', upcomingPeriod.id)

        const periodNumberMap = new Map<string, number>()
        pastPeriods?.forEach(p => periodNumberMap.set(p.id, p.period_number))

        // Fetch all historical matchups (excluding the upcoming period)
        const { data: historyData } = await supabase
          .from('rivalry_matchups')
          .select('player1_id, player2_id, period_id')
          .neq('period_id', upcomingPeriod.id)

        if (profilesData) {
          const players: RankedPlayer[] = profilesData.map(p => ({
            id: p.id,
            total_points: p.total_cumulative_points ?? 0,
          }))

          const history: HistoricalMatchup[] = (historyData ?? []).map(m => ({
            player1_id: m.player1_id,
            player2_id: m.player2_id,
            period_number: periodNumberMap.get(m.period_id) ?? 0,
          }))

          const { matchups, bye_player_id } = computePairings(
            players,
            history,
            upcomingPeriod.period_number
          )

          if (matchups.length > 0) {
            const rows = matchups.map(m => ({
              period_id: upcomingPeriod.id,
              player1_id: m.player1_id,
              player2_id: m.player2_id,
            }))

            const { error: insertError } = await supabase
              .from('rivalry_matchups')
              .insert(rows)

            if (insertError) throw insertError
          }

          console.log(
            `Rivalry period ${upcomingPeriod.period_number}: ${matchups.length} matchups created.` +
            (bye_player_id ? ` Bye: ${bye_player_id}` : ' No bye.')
          )
        }
      }
    } else {
      console.log('No rivalry period starts tomorrow, skipping pairing.')
    }

    // ── Rivalry close-out ────────────────────────────────────────────────────
    // Runs AFTER pairing so the next period's matchups are already in place.
    // A matchup is unresolved when player1_score IS NULL (set to NULL at creation,
    // gets a value — even 0 — when closed out, so ties are distinguishable).
    const { data: endedPeriods } = await supabase
      .from('rivalry_periods')
      .select('id, period_number, metric, start_date, end_date')
      .lt('end_date', rivalryToday)

    for (const period of endedPeriods ?? []) {
      const { data: unresolvedMatchups } = await supabase
        .from('rivalry_matchups')
        .select('id, player1_id, player2_id')
        .eq('period_id', period.id)
        .is('player1_score', null)

      if (!unresolvedMatchups || unresolvedMatchups.length === 0) continue

      const allIds = [...new Set(unresolvedMatchups.flatMap(m => [m.player1_id, m.player2_id]))]

      const { data: activities } = await supabase
        .from('strava_activities')
        .select('user_id, sport_type, distance, moving_time, total_elevation_gain, start_date')
        .in('user_id', allIds)
        .gte('start_date', periodStartUTC(period.start_date))
        .lt('start_date', periodEndUTC(period.end_date))
        .is('deleted_at', null)

      const scores = computeMetricScores((activities ?? []) as ActivityRow[], period.metric as MetricKey)

      for (const matchup of unresolvedMatchups) {
        const s1 = Math.round((scores[matchup.player1_id] ?? 0) * 100) / 100
        const s2 = Math.round((scores[matchup.player2_id] ?? 0) * 100) / 100
        const winner_id = s1 > s2 ? matchup.player1_id : s2 > s1 ? matchup.player2_id : null

        await supabase
          .from('rivalry_matchups')
          .update({ player1_score: s1, player2_score: s2, winner_id })
          .eq('id', matchup.id)
      }

      console.log(`Rivalry period ${period.period_number} closed out: ${unresolvedMatchups.length} matchups resolved.`)
    }

    console.log('Weekly cron job completed.')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in weekly cron job:', error)
    return NextResponse.json({ error: 'Weekly cron job failed' }, { status: 500 })
  }
}
