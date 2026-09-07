import { addDays, format, startOfWeek } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Habit-only side challenge. Runs from CHALLENGE_START (a Monday) until the
 * next season launches; there is no fixed end date.
 *
 * Scoring matches the app rule: 0.5 points per habit that meets its weekly
 * target, counting only the user's first 5 habits. Points are computed from
 * habit_entries here rather than read from user_profiles.cumulative_habit_points,
 * because that column still carries Season 4 totals.
 *
 * Each week is scored against the habits that existed during that week
 * (created on or before the week's Sunday, and not archived before the week's
 * Monday). Entries for soft-deleted habits stay in habit_entries, so a habit
 * deleted in October keeps the points it earned in September. `position` is
 * current-only, so reordering habits after the fact can change which five
 * count for past weeks; deletion cannot.
 */
export const CHALLENGE_START = '2026-09-07'

// "Current week" is anchored to this timezone for the on-demand message.
// habit_entries.week_start is written in each user's own timezone, but Monday
// is the same calendar date in every continental US zone, so grouping by the
// stored week_start string is consistent across participants.
const SUMMARY_TIMEZONE = 'America/New_York'

const ELIGIBLE_HABIT_COUNT = 5
const POINTS_PER_HABIT = 0.5

interface HabitRow {
  id: string
  user_id: string
  target_frequency: number
  position: number | null
  created_at: string
  archived_at: string | null
}

interface WeekResult {
  weekStart: string
  eligibleHabits: number
  habitsMet: number
  points: number
}

interface ParticipantResult {
  userId: string
  name: string
  totalPoints: number
  hasHabits: boolean
  currentWeek: WeekResult
  lastWeek: WeekResult | null
}

function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function displayDate(iso: string, withYear = false): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', withYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' })
}

function weekRangeLabel(weekStart: string): string {
  const end = addDays(new Date(weekStart + 'T12:00:00'), 6)
  return `${displayDate(weekStart)} - ${displayDate(isoDate(end))}`
}

function formatPoints(points: number): string {
  return `${points} pt${points === 1 ? '' : 's'}`
}

/**
 * Habits that existed during the given week, ordered by position then
 * created_at, capped at the first 5. This is the eligibility set for scoring.
 */
function eligibleHabitsForWeek(habits: HabitRow[], weekStart: string): HabitRow[] {
  const weekEndExclusive = isoDate(addDays(new Date(weekStart + 'T12:00:00'), 7))
  return habits
    .filter(h => {
      const created = h.created_at.slice(0, 10)
      if (created >= weekEndExclusive) return false
      if (h.archived_at && h.archived_at.slice(0, 10) < weekStart) return false
      return true
    })
    .sort((a, b) => {
      const pa = a.position ?? 0
      const pb = b.position ?? 0
      if (pa !== pb) return pa - pb
      return a.created_at.localeCompare(b.created_at)
    })
    .slice(0, ELIGIBLE_HABIT_COUNT)
}

function scoreWeek(
  habits: HabitRow[],
  successCounts: Map<string, number>,
  weekStart: string
): WeekResult {
  const eligible = eligibleHabitsForWeek(habits, weekStart)
  let habitsMet = 0
  for (const h of eligible) {
    const successes = successCounts.get(`${weekStart}|${h.id}`) ?? 0
    if (successes >= h.target_frequency) habitsMet++
  }
  return {
    weekStart,
    eligibleHabits: eligible.length,
    habitsMet,
    points: habitsMet * POINTS_PER_HABIT,
  }
}

export async function generateHabitChallengeSummary(
  supabase: SupabaseClient = createAdminClient(),
  now: Date = new Date()
): Promise<string> {
  // Week boundaries for the message
  const zonedNow = toZonedTime(now, SUMMARY_TIMEZONE)
  const currentWeekStart = isoDate(startOfWeek(zonedNow, { weekStartsOn: 1 }))
  if (currentWeekStart < CHALLENGE_START) {
    return `⚠️ The habit challenge starts ${displayDate(CHALLENGE_START, true)}. Nothing to report yet.`
  }
  const lastWeekStart = isoDate(addDays(new Date(currentWeekStart + 'T12:00:00'), -7))
  const hasLastWeek = lastWeekStart >= CHALLENGE_START

  const weekStarts: string[] = []
  for (let w = CHALLENGE_START; w <= currentWeekStart; w = isoDate(addDays(new Date(w + 'T12:00:00'), 7))) {
    weekStarts.push(w)
  }

  // Participants
  const { data: participants, error: participantsError } = await supabase
    .from('summary_participants')
    .select('user_id, display_name, sort_order')
    .eq('include_in_summary', true)
    .order('sort_order', { ascending: true })

  if (participantsError || !participants || participants.length === 0) {
    return '⚠️ No participants found for habit summary. Add participants in the admin panel.'
  }

  const userIds = participants.map(p => p.user_id)

  const [{ data: profiles }, { data: stravaConnections }, { data: habitRows, error: habitsError }] = await Promise.all([
    supabase.from('user_profiles').select('id, full_name, email').in('id', userIds),
    supabase.from('strava_connections').select('user_id, strava_firstname, strava_lastname').in('user_id', userIds),
    supabase
      .from('habits')
      .select('id, user_id, target_frequency, position, created_at, archived_at')
      .in('user_id', userIds),
  ])

  if (habitsError) {
    console.error('[Habit Challenge] Failed to load habits', habitsError)
    throw habitsError
  }

  const habits = (habitRows ?? []) as HabitRow[]
  const habitsByUser = new Map<string, HabitRow[]>()
  for (const h of habits) {
    const list = habitsByUser.get(h.user_id) ?? []
    list.push(h)
    habitsByUser.set(h.user_id, list)
  }

  // SUCCESS entries since the challenge start, keyed `${week_start}|${habit_id}`.
  // Queried by habit_id so entries of soft-deleted habits are included.
  const successCounts = new Map<string, number>()
  const habitIds = habits.map(h => h.id)
  if (habitIds.length > 0) {
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data: rows, error } = await supabase
        .from('habit_entries')
        .select('habit_id, week_start')
        .eq('status', 'SUCCESS')
        .gte('week_start', CHALLENGE_START)
        .in('habit_id', habitIds)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) {
        console.error('[Habit Challenge] Failed to load habit entries', error)
        throw error
      }
      for (const r of rows ?? []) {
        const key = `${r.week_start}|${r.habit_id}`
        successCounts.set(key, (successCounts.get(key) ?? 0) + 1)
      }
      if (!rows || rows.length < pageSize) break
    }
  }

  // Score each participant
  const results: ParticipantResult[] = participants.map(p => {
    const profile = profiles?.find(prof => prof.id === p.user_id)
    const strava = stravaConnections?.find(sc => sc.user_id === p.user_id)
    const rawName =
      p.display_name ||
      (strava ? `${strava.strava_firstname || ''} ${strava.strava_lastname || ''}`.trim() : '') ||
      profile?.full_name ||
      profile?.email?.split('@')[0] ||
      'Unknown'
    const name = rawName.replace(/\s+/g, ' ').trim()

    const userHabits = habitsByUser.get(p.user_id) ?? []
    let totalPoints = 0
    for (const w of weekStarts) {
      totalPoints += scoreWeek(userHabits, successCounts, w).points
    }

    return {
      userId: p.user_id,
      name,
      totalPoints,
      hasHabits: userHabits.some(h => !h.archived_at),
      currentWeek: scoreWeek(userHabits, successCounts, currentWeekStart),
      lastWeek: hasLastWeek ? scoreWeek(userHabits, successCounts, lastWeekStart) : null,
    }
  })

  const tracking = results.filter(r => r.hasHabits)
  const notTracking = results.filter(r => !r.hasHabits)

  // Overall standings: points desc, then name. Ties share a rank.
  const standings = [...tracking].sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name))

  let message = `🏆 *FitFight Habit Challenge* 🏆\n`
  message += `_Since ${displayDate(CHALLENGE_START, true)}_\n\n`

  message += `*Overall Standings* 📊\n`
  let rank = 0
  standings.forEach((r, i) => {
    if (i === 0 || r.totalPoints !== standings[i - 1].totalPoints) rank = i + 1
    message += `${rank}. ${r.name}: ${formatPoints(r.totalPoints)}\n`
  })
  message += '\n'

  message += `*This Week So Far* 🔥\n`
  message += `_${weekRangeLabel(currentWeekStart)}_\n`
  const thisWeek = [...tracking].sort((a, b) =>
    b.currentWeek.habitsMet - a.currentWeek.habitsMet || a.name.localeCompare(b.name))
  thisWeek.forEach(r => {
    const w = r.currentWeek
    const star = w.eligibleHabits > 0 && w.habitsMet === w.eligibleHabits ? ' ⭐' : ''
    message += `• ${r.name}: ${w.habitsMet}/${w.eligibleHabits} habits, ${formatPoints(w.points)}${star}\n`
  })
  message += '\n'

  if (hasLastWeek) {
    message += `*Last Week* ✅\n`
    message += `_${weekRangeLabel(lastWeekStart)}_\n`
    const lastWeek = [...tracking].sort((a, b) =>
      (b.lastWeek?.habitsMet ?? 0) - (a.lastWeek?.habitsMet ?? 0) || a.name.localeCompare(b.name))
    lastWeek.forEach(r => {
      const w = r.lastWeek!
      const star = w.eligibleHabits > 0 && w.habitsMet === w.eligibleHabits ? ' ⭐' : ''
      message += `• ${r.name}: ${w.habitsMet}/${w.eligibleHabits} habits, ${formatPoints(w.points)}${star}\n`
    })
    message += '\n'
  }

  if (notTracking.length > 0) {
    message += `*Not Tracking Habits*\n`
    notTracking.forEach(r => {
      message += `• ${r.name}\n`
    })
    message += '\n'
  }

  return message.trimEnd()
}
