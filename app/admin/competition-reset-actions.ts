'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function resetCompetition(confirmationText: string) {
  // Triple-check authorization
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized - only Gabriel Beal can reset the competition')
  }

  // Verify confirmation text
  if (confirmationText !== 'RESET COMPETITION') {
    throw new Error('Invalid confirmation text')
  }

  // Use admin client for all operations
  const supabase = createAdminClient()

  try {
    console.log('Starting competition reset...')

    // 1. Delete all user badges
    const { error: badgesError } = await supabase
      .from('user_badges')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (using impossible UUID)

    if (badgesError) {
      console.error('Error deleting user badges:', badgesError)
      throw new Error(`Failed to delete user badges: ${badgesError.message}`)
    }
    console.log('✓ Deleted all user badges')

    // 2. Delete all badge progress
    const { error: progressError } = await supabase
      .from('badge_progress')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (progressError) {
      console.error('Error deleting badge progress:', progressError)
      throw new Error(`Failed to delete badge progress: ${progressError.message}`)
    }
    console.log('✓ Deleted all badge progress')

    // 3. Delete all Strava activities
    const { error: activitiesError } = await supabase
      .from('strava_activities')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (activitiesError) {
      console.error('Error deleting Strava activities:', activitiesError)
      throw new Error(`Failed to delete Strava activities: ${activitiesError.message}`)
    }
    console.log('✓ Deleted all Strava activities')

    // 4. Delete all habit entries (success/failure records)
    const { error: habitEntriesError } = await supabase
      .from('habit_entries')
      .delete()
      .neq('habit_id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (habitEntriesError) {
      console.error('Error deleting habit entries:', habitEntriesError)
      throw new Error(`Failed to delete habit entries: ${habitEntriesError.message}`)
    }
    console.log('✓ Deleted all habit entries')

    // 5. Delete all weekly exercise tracking records
    const { error: weeklyTrackingError } = await supabase
      .from('weekly_exercise_tracking')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (weeklyTrackingError) {
      console.error('Error deleting weekly exercise tracking:', weeklyTrackingError)
      throw new Error(`Failed to delete weekly tracking: ${weeklyTrackingError.message}`)
    }
    console.log('✓ Deleted all weekly exercise tracking')

    // 6. Reset all cumulative points in user_profiles to 0
    // First, get all user profiles to reset them
    const { data: profiles, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id')

    if (fetchError) {
      console.error('Error fetching user profiles:', fetchError)
      throw new Error(`Failed to fetch user profiles: ${fetchError.message}`)
    }

    // Reset points for each user using the RPC functions to ensure proper calculation
    for (const profile of profiles || []) {
      // Reset exercise points
      const { error: exerciseError } = await supabase
        .from('user_profiles')
        .update({
          cumulative_exercise_points: 0,
          cumulative_habit_points: 0,
          cumulative_badge_points: 0
        })
        .eq('id', profile.id)

      if (exerciseError) {
        console.error(`Error resetting points for user ${profile.id}:`, exerciseError)
        throw new Error(`Failed to reset points for user: ${exerciseError.message}`)
      }
    }
    console.log(`✓ Reset cumulative points for ${profiles?.length || 0} users`)

    // 7. Clear division history (optional - keeping for now as it's historical)
    // If you want to clear division history too, uncomment this:
    /*
    const { error: historyError } = await supabase
      .from('division_history')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (historyError) {
      console.error('Error deleting division history:', historyError)
      throw new Error(`Failed to delete division history: ${historyError.message}`)
    }
    console.log('✓ Deleted all division history')
    */

    // 8. Log the reset event for audit purposes
    console.log(`Competition reset completed successfully at ${new Date().toISOString()} by ${user.email}`)

    return {
      success: true,
      message: 'Competition has been completely reset. All points, badges, activities, and habit records have been cleared.',
      timestamp: new Date().toISOString(),
      resetBy: user.email
    }

  } catch (error) {
    console.error('Competition reset failed:', error)
    throw error
  }
}

// Function to get current competition stats (for showing what will be deleted)
export async function getCompetitionStats() {
  // Check authorization
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  const supabase = createAdminClient()

  try {
    // Get counts of what will be deleted
    const [
      { count: badgeCount },
      { count: activityCount },
      { count: habitEntryCount },
      { data: usersWithPoints }
    ] = await Promise.all([
      supabase.from('user_badges').select('*', { count: 'exact', head: true }),
      supabase.from('strava_activities').select('*', { count: 'exact', head: true }),
      supabase.from('habit_entries').select('*', { count: 'exact', head: true }),
      supabase
        .from('user_profiles')
        .select('id, total_cumulative_points')
        .gt('total_cumulative_points', 0)
    ])

    return {
      badgeCount: badgeCount || 0,
      activityCount: activityCount || 0,
      habitEntryCount: habitEntryCount || 0,
      usersWithPoints: usersWithPoints?.length || 0,
      totalPoints: usersWithPoints?.reduce((sum, u) => sum + (u.total_cumulative_points || 0), 0) || 0
    }
  } catch (error) {
    console.error('Error getting competition stats:', error)
    return {
      badgeCount: 0,
      activityCount: 0,
      habitEntryCount: 0,
      usersWithPoints: 0,
      totalPoints: 0
    }
  }
}