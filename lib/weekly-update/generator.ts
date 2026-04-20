import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { rivalryTodayStr } from '@/lib/rivalries/time-window'

interface LeaderboardEntry {
  userId: string
  name: string
  totalPoints: number
  exercisePoints: number
  habitPoints: number
  badgePoints: number
  rank: number
  previousRank: number | null
  rankChange: number | null
}

interface BadgeAwarded {
  userName: string
  badgeName: string
  badgeEmoji: string
  tier: string
  earnedAt: string
}

interface RivalryMatchupResult {
  player1Name: string
  player2Name: string
  player1Score: number
  player2Score: number
  winnerName: string | null
  metric: string
  periodNumber: number
}

interface ActiveMatchup {
  player1Name: string
  player2Name: string
  metric: string
  periodNumber: number
}

function getWeekBounds(weeksAgo: number = 0): { start: string; end: string; label: string } {
  const now = new Date()
  const day = now.getUTCDay()
  const daysToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday - weeksAgo * 7))
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
    label: monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) +
           ' – ' +
           sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
  }
}

function getDisplayName(profile: { full_name: string | null; email: string | null }, strava: { strava_firstname: string | null; strava_lastname: string | null } | null): string {
  if (strava?.strava_firstname) {
    return `${strava.strava_firstname} ${strava.strava_lastname || ''}`.trim()
  }
  return profile.full_name || profile.email?.split('@')[0] || 'Unknown'
}

export async function generateCompetitionUpdate(): Promise<string> {
  const supabase = createAdminClient()
  const now = new Date()
  // On Monday, the current week has almost no data yet — recap last week instead.
  // Every other day (Tue–Sun) report on the current in-progress / just-ending week.
  const weeksAgo = now.getUTCDay() === 1 ? 1 : 0
  const lastWeek = getWeekBounds(weeksAgo)
  // Rivalry period lookups use PT-anchored "today" — a period with start_date
  // Apr 20 hasn't "started" until midnight PT Apr 20 (07:00 UTC).
  const todayStr = rivalryTodayStr(now)

  // ── 1. Current leaderboard ─────────────────────────────────────────────
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, total_cumulative_points, cumulative_exercise_points, cumulative_habit_points, cumulative_badge_points')
    .order('total_cumulative_points', { ascending: false })

  const { data: stravaConns } = await supabase
    .from('strava_connections')
    .select('user_id, strava_firstname, strava_lastname')

  const stravaMap = new Map(stravaConns?.map(s => [s.user_id, s]) ?? [])

  // ── 2. Previous week snapshot for rank comparison ──────────────────────
  // Find the most recent snapshot week before the current one
  const { data: snapshots } = await supabase
    .from('leaderboard_snapshots')
    .select('user_id, rank, total_points, week_start')
    .lt('week_start', lastWeek.end)
    .order('week_start', { ascending: false })
    .limit(200)

  // Group by week_start, pick the most recent week that has data
  const snapshotsByWeek = new Map<string, typeof snapshots>()
  for (const s of snapshots ?? []) {
    if (!snapshotsByWeek.has(s.week_start)) snapshotsByWeek.set(s.week_start, [])
    snapshotsByWeek.get(s.week_start)!.push(s)
  }
  const latestSnapshotWeek = [...snapshotsByWeek.keys()].sort().at(-1)
  const prevSnapshot = latestSnapshotWeek ? snapshotsByWeek.get(latestSnapshotWeek) ?? [] : []
  const prevRankMap = new Map(prevSnapshot.map(s => [s.user_id, s.rank]))

  // Build leaderboard
  const leaderboard: LeaderboardEntry[] = (profiles ?? []).map((p, idx) => {
    const strava = stravaMap.get(p.id) ?? null
    const prevRank = prevRankMap.get(p.id) ?? null
    return {
      userId: p.id,
      name: getDisplayName(p, strava),
      totalPoints: p.total_cumulative_points ?? 0,
      exercisePoints: p.cumulative_exercise_points ?? 0,
      habitPoints: p.cumulative_habit_points ?? 0,
      badgePoints: p.cumulative_badge_points ?? 0,
      rank: idx + 1,
      previousRank: prevRank,
      rankChange: prevRank !== null ? prevRank - (idx + 1) : null,
    }
  })

  // ── 3. Badges earned this week ─────────────────────────────────────────
  const { data: recentBadges } = await supabase
    .from('user_badges')
    .select('user_id, tier, earned_at, badge_id')
    .gte('earned_at', `${lastWeek.start}T00:00:00Z`)
    .lte('earned_at', `${lastWeek.end}T23:59:59Z`)
    .order('earned_at', { ascending: false })

  const badgeIds = [...new Set(recentBadges?.map(b => b.badge_id) ?? [])]
  const { data: badgeDefs } = badgeIds.length > 0
    ? await supabase.from('badges').select('id, name, emoji').in('id', badgeIds)
    : { data: [] }

  const badgeDefMap = new Map(badgeDefs?.map(b => [b.id, b]) ?? [])

  const badgesAwarded: BadgeAwarded[] = (recentBadges ?? []).map(ub => {
    const profile = profiles?.find(p => p.id === ub.user_id)
    const strava = profile ? stravaMap.get(profile.id) ?? null : null
    const badgeDef = badgeDefMap.get(ub.badge_id)
    return {
      userName: profile ? getDisplayName(profile, strava) : 'Unknown',
      badgeName: badgeDef?.name ?? 'Unknown Badge',
      badgeEmoji: badgeDef?.emoji ?? '🏅',
      tier: ub.tier,
      earnedAt: ub.earned_at,
    }
  })

  // ── 4. Rivalry results & active matchups ──────────────────────────────
  const { data: recentPeriods } = await supabase
    .from('rivalry_periods')
    .select('id, period_number, metric, start_date, end_date')
    .lte('start_date', todayStr)
    .order('start_date', { ascending: false })
    .limit(3)

  const resolvedResults: RivalryMatchupResult[] = []
  const activeMatchups: ActiveMatchup[] = []

  for (const period of recentPeriods ?? []) {
    const { data: matchups } = await supabase
      .from('rivalry_matchups')
      .select('player1_id, player2_id, player1_score, player2_score, winner_id')
      .eq('period_id', period.id)

    for (const m of matchups ?? []) {
      const p1Profile = profiles?.find(p => p.id === m.player1_id)
      const p2Profile = profiles?.find(p => p.id === m.player2_id)
      const p1Name = p1Profile ? getDisplayName(p1Profile, stravaMap.get(m.player1_id) ?? null) : 'Unknown'
      const p2Name = p2Profile ? getDisplayName(p2Profile, stravaMap.get(m.player2_id) ?? null) : 'Unknown'

      if (m.player1_score !== null) {
        const winnerProfile = m.winner_id ? profiles?.find(p => p.id === m.winner_id) : null
        const winnerName = winnerProfile ? getDisplayName(winnerProfile, stravaMap.get(m.winner_id!) ?? null) : null
        resolvedResults.push({
          player1Name: p1Name,
          player2Name: p2Name,
          player1Score: m.player1_score,
          player2Score: m.player2_score,
          winnerName,
          metric: period.metric,
          periodNumber: period.period_number,
        })
      } else {
        activeMatchups.push({
          player1Name: p1Name,
          player2Name: p2Name,
          metric: period.metric,
          periodNumber: period.period_number,
        })
      }
    }
  }

  // ── 5. Top exercise performers last week ──────────────────────────────
  const { data: lastWeekActivities } = await supabase
    .from('strava_activities')
    .select('user_id, moving_time, distance, sport_type')
    .gte('start_date', `${lastWeek.start}T00:00:00Z`)
    .lte('start_date', `${lastWeek.end}T23:59:59Z`)
    .is('deleted_at', null)

  const exerciseTotals = new Map<string, { minutes: number; activities: number }>()
  for (const act of lastWeekActivities ?? []) {
    const existing = exerciseTotals.get(act.user_id) ?? { minutes: 0, activities: 0 }
    existing.minutes += Math.round((act.moving_time ?? 0) / 60)
    existing.activities += 1
    exerciseTotals.set(act.user_id, existing)
  }

  const topExercisers = [...exerciseTotals.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 5)
    .map(([userId, stats]) => {
      const profile = profiles?.find(p => p.id === userId)
      const strava = profile ? stravaMap.get(userId) ?? null : null
      return {
        name: profile ? getDisplayName(profile, strava) : 'Unknown',
        minutes: stats.minutes,
        activities: stats.activities,
      }
    })

  // ── 6. Build data summary for Claude ──────────────────────────────────
  let dataSummary = `WEEK: ${lastWeek.label}\n\n`

  dataSummary += `=== OVERALL LEADERBOARD ===\n`
  for (const entry of leaderboard) {
    const rankChange = entry.rankChange !== null
      ? entry.rankChange > 0 ? ` (↑${entry.rankChange})` : entry.rankChange < 0 ? ` (↓${Math.abs(entry.rankChange)})` : ' (→)'
      : ' (new)'
    dataSummary += `${entry.rank}. ${entry.name}: ${entry.totalPoints.toFixed(0)} pts${rankChange} [exercise: ${entry.exercisePoints.toFixed(0)}, habits: ${entry.habitPoints.toFixed(0)}, badges: ${entry.badgePoints.toFixed(0)}]\n`
  }

  dataSummary += `\n=== TOP EXERCISERS LAST WEEK ===\n`
  if (topExercisers.length > 0) {
    for (const e of topExercisers) {
      dataSummary += `• ${e.name}: ${e.minutes} min across ${e.activities} activit${e.activities === 1 ? 'y' : 'ies'}\n`
    }
  } else {
    dataSummary += '(no activities logged)\n'
  }

  if (badgesAwarded.length > 0) {
    dataSummary += `\n=== BADGES EARNED THIS WEEK ===\n`
    for (const b of badgesAwarded) {
      dataSummary += `• ${b.userName} earned ${b.badgeEmoji} ${b.badgeName} (${b.tier})\n`
    }
  }

  if (resolvedResults.length > 0) {
    // Only show the most recent period's results
    const latestPeriod = Math.max(...resolvedResults.map(r => r.periodNumber))
    const latestResults = resolvedResults.filter(r => r.periodNumber === latestPeriod)
    dataSummary += `\n=== RIVALRY RESULTS (Period ${latestPeriod}) ===\n`
    for (const r of latestResults) {
      const tie = r.winnerName === null
      dataSummary += `• ${r.player1Name} vs ${r.player2Name}: ${r.player1Score} – ${r.player2Score} (${tie ? 'TIE' : `Winner: ${r.winnerName}`}) [${r.metric}]\n`
    }
  }

  if (activeMatchups.length > 0) {
    const activePeriod = activeMatchups[0].periodNumber
    dataSummary += `\n=== ACTIVE RIVALRY MATCHUPS (Period ${activePeriod}) ===\n`
    for (const m of activeMatchups) {
      dataSummary += `• ${m.player1Name} vs ${m.player2Name} [${m.metric}]\n`
    }
  }

  // ── 7. Call Claude Sonnet ─────────────────────────────────────────────
  const client = new Anthropic()

  const systemPrompt = `You are the hype announcer for FitnessFight Club, a friendly competitive fitness app where friends track workouts via Strava and earn points in three categories: exercise (time spent working out), habits (completing weekly habit goals), and badges (special achievements). Players compete head-to-head in two-week "rivalry" periods. The community vibe is fun, encouraging, and competitive.

Write a weekly competition update message for the WhatsApp group. Use *bold* for names and key stats (WhatsApp markdown). Use _italic_ for flavor text. Use relevant fitness/sports emojis generously. Be exciting, specific, and call out notable moments. Mention rank changes (who's climbing, who's slipping), badge achievements, rivalry drama, and top workout performances. Keep it punchy and celebratory — around 200-350 words. Do not use headers or bullet points — write it as flowing prose paragraphs separated by blank lines.`

  const userPrompt = `Here is this week's competition data. Write the WhatsApp update:\n\n${dataSummary}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')
  return content.text
}
