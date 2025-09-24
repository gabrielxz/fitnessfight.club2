import { createAdminClient } from '@/lib/supabase/admin'

interface ParticipantResult {
  userId: string
  name: string
  perfectHabits: number
  totalHabits: number
  isPerfect: boolean
}

// Helper to get the start of the previous completed week (Monday)
function getLastWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const adjustedDay = day === 0 ? 7 : day
  const diff = d.getUTCDate() - (adjustedDay - 1) - 7 // Go back to previous Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

// Helper to get the end of a week (Sunday)
function getWeekEnd(weekStart: Date): Date {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)
  return weekEnd
}

export async function generateHabitSummary(weekOffset: number = 0): Promise<string> {
  const supabase = createAdminClient()

  // Calculate the week to analyze (default is last completed week)
  const now = new Date()
  const targetWeekStart = getLastWeekStart(now)
  if (weekOffset !== 0) {
    targetWeekStart.setDate(targetWeekStart.getDate() + (weekOffset * 7))
  }
  const targetWeekEnd = getWeekEnd(targetWeekStart)

  // Format dates for display
  const weekStartStr = targetWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const weekEndStr = targetWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // Get all participants
  const { data: participants, error: participantsError } = await supabase
    .from('summary_participants')
    .select(`
      *,
      user_profiles!inner(
        id,
        full_name,
        email
      ),
      strava_connections(
        strava_firstname,
        strava_lastname
      )
    `)
    .eq('include_in_summary', true)
    .order('sort_order', { ascending: true })

  if (participantsError || !participants || participants.length === 0) {
    return '⚠️ No participants found for habit summary. Add participants in the admin panel.'
  }

  // Calculate results for each participant
  const results: ParticipantResult[] = []

  for (const participant of participants) {
    // Get display name (priority: custom > strava > profile > email)
    const displayName =
      participant.display_name ||
      (participant.strava_connections?.[0] ?
        `${participant.strava_connections[0].strava_firstname || ''} ${participant.strava_connections[0].strava_lastname || ''}`.trim() : null) ||
      participant.user_profiles?.full_name ||
      participant.user_profiles?.email?.split('@')[0] ||
      'Unknown'

    // Get user's habits
    const { data: habits } = await supabase
      .from('habits')
      .select('id, name, target_frequency')
      .eq('user_id', participant.user_id)
      .is('archived_at', null)

    if (!habits || habits.length === 0) {
      results.push({
        userId: participant.user_id,
        name: displayName,
        perfectHabits: 0,
        totalHabits: 0,
        isPerfect: false
      })
      continue
    }

    // Check each habit's completion for the week
    let perfectCount = 0
    const weekStartISO = targetWeekStart.toISOString().split('T')[0]

    for (const habit of habits) {
      // Get entries for this habit in the target week
      const { data: entries } = await supabase
        .from('habit_entries')
        .select('status')
        .eq('habit_id', habit.id)
        .eq('week_start', weekStartISO)
        .eq('status', 'SUCCESS')

      const successCount = entries?.length || 0

      // Check if habit met its target
      if (successCount >= habit.target_frequency) {
        perfectCount++
      }
    }

    results.push({
      userId: participant.user_id,
      name: displayName,
      perfectHabits: perfectCount,
      totalHabits: habits.length,
      isPerfect: perfectCount === habits.length && habits.length > 0
    })
  }

  // Sort and group results
  const perfectWeek = results.filter(r => r.isPerfect && r.totalHabits > 0)
    .sort((a, b) => b.perfectHabits - a.perfectHabits)

  const keepPushing = results.filter(r => !r.isPerfect && r.perfectHabits > 0)
    .sort((a, b) => {
      const aRatio = a.perfectHabits / a.totalHabits
      const bRatio = b.perfectHabits / b.totalHabits
      return bRatio - aRatio
    })

  const roomToGrow = results.filter(r => r.perfectHabits === 0 && r.totalHabits > 0)

  const noHabits = results.filter(r => r.totalHabits === 0)

  // Find champion (most perfect habits)
  const champion = [...results]
    .filter(r => r.perfectHabits > 0)
    .sort((a, b) => b.perfectHabits - a.perfectHabits)[0]

  // Format for WhatsApp
  let message = `🏆 *FitFight Habit Week Results* 🏆\n`
  message += `_${weekStartStr} to ${weekEndStr}_\n\n`

  if (perfectWeek.length > 0) {
    message += `*Perfect Week Club* ⭐\n`
    perfectWeek.forEach(p => {
      message += `• ${p.name}: ${p.perfectHabits}/${p.totalHabits} habits\n`
    })
    message += '\n'
  }

  if (keepPushing.length > 0) {
    message += `*Keep Pushing* 💪\n`
    keepPushing.forEach(p => {
      message += `• ${p.name}: ${p.perfectHabits}/${p.totalHabits} habits\n`
    })
    message += '\n'
  }

  if (roomToGrow.length > 0) {
    message += `*Room to Grow* 🌱\n`
    roomToGrow.forEach(p => {
      message += `• ${p.name}: ${p.perfectHabits}/${p.totalHabits} habits\n`
    })
    message += '\n'
  }

  if (noHabits.length > 0) {
    message += `*Not Tracking Habits*\n`
    noHabits.forEach(p => {
      message += `• ${p.name}\n`
    })
    message += '\n'
  }

  if (champion) {
    message += `*This Week's Champion* 👑\n`
    message += `${champion.name} with ${champion.perfectHabits} perfect habit${champion.perfectHabits !== 1 ? 's' : ''}!\n\n`
  }

  message += `_Keep crushing it, team!_`

  return message
}