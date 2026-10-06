'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/season'

export async function resetCompetition(
  confirmationText: string,
  seasonName: string,
  seasonStart: string
) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized - only Gabriel Beal can reset the competition')
  }

  if (confirmationText !== 'RESET COMPETITION') {
    throw new Error('Invalid confirmation text')
  }

  const name = seasonName.trim()
  if (!name) {
    throw new Error('Season name is required')
  }
  const startDate = new Date(`${seasonStart}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seasonStart) || isNaN(startDate.getTime()) || startDate.getUTCDay() !== 1) {
    throw new Error('Season start must be a Monday (YYYY-MM-DD)')
  }

  const supabase = createAdminClient()

  const current = await getCurrentSeason(supabase)
  // A retry after a partial failure finds the new season already in place.
  const isRetry = current?.starts_on === seasonStart
  if (current && !isRetry) {
    if (seasonStart < current.starts_on) {
      throw new Error(`Season start must be after the current season start (${current.starts_on})`)
    }
    if (current.ends_on && seasonStart <= current.ends_on) {
      throw new Error(`Season start must be after the current season end (${current.ends_on})`)
    }
  }

  try {
    console.log('Starting competition reset...')

    // 0. Stamp the new season first. Points only count for weeks on or after it
    //    and pre-season Strava activities are not stored, so backfills made after
    //    the reset cannot earn points. If this fails, nothing has been deleted.
    //    An open current season is closed on the Sunday before the new start.
    if (!isRetry) {
      if (current && !current.ends_on) {
        const prevSunday = new Date(startDate)
        prevSunday.setUTCDate(prevSunday.getUTCDate() - 1)
        const { error: closeError } = await supabase
          .from('seasons')
          .update({ ends_on: prevSunday.toISOString().split('T')[0] })
          .eq('id', current.id)
        if (closeError) throw new Error(`Failed to close ${current.name}: ${closeError.message}`)
      }
      const { error: seasonError } = await supabase
        .from('seasons')
        .insert({ name, starts_on: seasonStart })
      if (seasonError) throw new Error(`Failed to create season: ${seasonError.message}`)
    }
    console.log(`✓ Started ${name} on ${seasonStart}`)

    // 1. Delete all earned badges
    const { error: badgesError } = await supabase
      .from('user_badges')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (badgesError) throw new Error(`Failed to delete user badges: ${badgesError.message}`)
    console.log('✓ Deleted all user badges')

    // 2. Delete all badge progress
    const { error: progressError } = await supabase
      .from('badge_progress')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (progressError) throw new Error(`Failed to delete badge progress: ${progressError.message}`)
    console.log('✓ Deleted all badge progress')

    // 3. Delete all Strava activities
    const { error: activitiesError } = await supabase
      .from('strava_activities')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (activitiesError) throw new Error(`Failed to delete Strava activities: ${activitiesError.message}`)
    console.log('✓ Deleted all Strava activities')

    // 4. Delete all weekly exercise tracking
    const { error: weeklyError } = await supabase
      .from('weekly_exercise_tracking')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (weeklyError) throw new Error(`Failed to delete weekly tracking: ${weeklyError.message}`)
    console.log('✓ Deleted all weekly exercise tracking')

    // 5. Delete all rivalry matchups (clears kill marks / skull counts)
    const { error: matchupsError } = await supabase
      .from('rivalry_matchups')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (matchupsError) throw new Error(`Failed to delete rivalry matchups: ${matchupsError.message}`)
    console.log('✓ Deleted all rivalry matchups (kill marks reset to 0)')

    // 6. Reset all cumulative points to 0. Habit entries are kept as history;
    //    the season floor stops pre-season weeks from scoring.
    const { data: profiles, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id')
    if (fetchError) throw new Error(`Failed to fetch user profiles: ${fetchError.message}`)

    for (const profile of profiles || []) {
      const { error: pointsError } = await supabase
        .from('user_profiles')
        .update({
          cumulative_exercise_points: 0,
          cumulative_habit_points: 0,
          cumulative_badge_points: 0
        })
        .eq('id', profile.id)
      if (pointsError) throw new Error(`Failed to reset points for user: ${pointsError.message}`)
    }
    console.log(`✓ Reset all points for ${profiles?.length || 0} users`)

    console.log(`Competition reset completed at ${new Date().toISOString()} by ${user.email}`)

    return {
      success: true,
      message: `${name} started on ${seasonStart}. Points, badges, activities, and rivalry data have been cleared. Habit history is kept.`,
      timestamp: new Date().toISOString(),
      resetBy: user.email
    }

  } catch (error) {
    console.error('Competition reset failed:', error)
    throw error
  }
}

export async function getCompetitionStats() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  const supabase = createAdminClient()

  try {
    const currentSeason = await getCurrentSeason(supabase)
    const [
      { count: badgeCount },
      { count: activityCount },
      { count: habitEntryCount },
      { count: matchupCount },
      { data: usersWithPoints }
    ] = await Promise.all([
      supabase.from('user_badges').select('*', { count: 'exact', head: true }),
      supabase.from('strava_activities').select('*', { count: 'exact', head: true }),
      supabase.from('habit_entries').select('*', { count: 'exact', head: true }),
      supabase.from('rivalry_matchups').select('*', { count: 'exact', head: true }),
      supabase.from('user_profiles').select('id, total_cumulative_points').gt('total_cumulative_points', 0)
    ])

    return {
      badgeCount: badgeCount || 0,
      activityCount: activityCount || 0,
      habitEntryCount: habitEntryCount || 0,
      matchupCount: matchupCount || 0,
      usersWithPoints: usersWithPoints?.length || 0,
      totalPoints: usersWithPoints?.reduce((sum, u) => sum + (u.total_cumulative_points || 0), 0) || 0,
      currentSeason
    }
  } catch (error) {
    console.error('Error getting competition stats:', error)
    return { badgeCount: 0, activityCount: 0, habitEntryCount: 0, matchupCount: 0, usersWithPoints: 0, totalPoints: 0, currentSeason: null }
  }
}
