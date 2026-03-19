'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function resetCompetition(confirmationText: string) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized - only Gabriel Beal can reset the competition')
  }

  if (confirmationText !== 'RESET COMPETITION') {
    throw new Error('Invalid confirmation text')
  }

  const supabase = createAdminClient()

  try {
    console.log('Starting competition reset...')

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

    // 4. Delete all habit entries
    const { error: habitEntriesError } = await supabase
      .from('habit_entries')
      .delete()
      .neq('habit_id', '00000000-0000-0000-0000-000000000000')
    if (habitEntriesError) throw new Error(`Failed to delete habit entries: ${habitEntriesError.message}`)
    console.log('✓ Deleted all habit entries')

    // 5. Delete all weekly exercise tracking
    const { error: weeklyError } = await supabase
      .from('weekly_exercise_tracking')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (weeklyError) throw new Error(`Failed to delete weekly tracking: ${weeklyError.message}`)
    console.log('✓ Deleted all weekly exercise tracking')

    // 6. Delete all rivalry matchups (clears kill marks / skull counts)
    const { error: matchupsError } = await supabase
      .from('rivalry_matchups')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (matchupsError) throw new Error(`Failed to delete rivalry matchups: ${matchupsError.message}`)
    console.log('✓ Deleted all rivalry matchups (kill marks reset to 0)')

    // 7. Reset all cumulative points to 0
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
      message: 'Competition reset complete. All points, badges, activities, habit records, and rivalry data have been cleared.',
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
      totalPoints: usersWithPoints?.reduce((sum, u) => sum + (u.total_cumulative_points || 0), 0) || 0
    }
  } catch (error) {
    console.error('Error getting competition stats:', error)
    return { badgeCount: 0, activityCount: 0, habitEntryCount: 0, matchupCount: 0, usersWithPoints: 0, totalPoints: 0 }
  }
}
