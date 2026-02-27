import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BadgeCalculator } from '@/lib/badges/BadgeCalculator'
import { computePairings, type RankedPlayer, type HistoricalMatchup } from '@/lib/rivalries/pairing'

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

    // ── Rivalry pairing ─────────────────────────────────────────────────────
    // The cron runs Sunday 11:59 PM UTC. If tomorrow (Monday) is the start_date
    // of a rivalry period, generate pairings for it now.
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    ))
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    const { data: upcomingPeriod } = await supabase
      .from('rivalry_periods')
      .select('id, period_number')
      .eq('start_date', tomorrowStr)
      .maybeSingle()

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
          .select('user_id, total_cumulative_points')
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
            id: p.user_id,
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

    console.log('Weekly cron job completed.')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in weekly cron job:', error)
    return NextResponse.json({ error: 'Weekly cron job failed' }, { status: 500 })
  }
}
