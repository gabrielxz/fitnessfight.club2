'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Ensures a user has all the necessary database entries:
 * - user_profiles entry
 *
 * This is useful for users who may have signed up before certain
 * features were implemented or after a reset.
 */
export async function ensureUserDataConsistency(userId: string) {
  // Check authorization
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  const adminClient = createAdminClient()

  try {
    // Get user info from auth.users
    const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId)
    if (authError || !authUser) {
      throw new Error(`User not found in auth.users: ${authError?.message}`)
    }

    // 1. Ensure user_profiles entry exists
    const { data: existingProfile } = await adminClient
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (!existingProfile) {
      console.log(`Creating user_profiles entry for ${userId}`)
      const { error: profileError } = await adminClient
        .from('user_profiles')
        .insert({
          id: userId,
          email: authUser.user.email,
          full_name: authUser.user.user_metadata?.full_name ||
                     authUser.user.user_metadata?.name ||
                     authUser.user.email?.split('@')[0],
          avatar_url: authUser.user.user_metadata?.avatar_url,
          cumulative_exercise_points: 0,
          cumulative_habit_points: 0,
          cumulative_badge_points: 0
        })

      if (profileError) {
        console.error('Error creating user_profiles:', profileError)
        throw new Error(`Failed to create user profile: ${profileError.message}`)
      }
      console.log('✓ Created user_profiles entry')
    } else {
      console.log('✓ user_profiles entry already exists')
    }

    revalidatePath('/admin')

    return {
      success: true,
      message: 'User data consistency ensured',
      userId
    }

  } catch (error) {
    console.error('Error ensuring user data consistency:', error)
    throw error
  }
}

/**
 * Gets diagnostic information about a user's data state
 */
export async function getUserDataDiagnostics(userId: string) {
  // Check authorization
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  const adminClient = createAdminClient()

  try {
    const [
      { data: authUser },
      { data: profile },
      { data: stravaConnection }
    ] = await Promise.all([
      adminClient.auth.admin.getUserById(userId),
      adminClient.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
      adminClient.from('strava_connections').select('*').eq('user_id', userId).maybeSingle()
    ])

    return {
      userId,
      hasAuthUser: !!authUser?.user,
      authUserEmail: authUser?.user?.email,
      hasProfile: !!profile,
      profileData: profile,
      hasStravaConnection: !!stravaConnection,
      stravaData: stravaConnection
    }
  } catch (error) {
    console.error('Error getting diagnostics:', error)
    throw error
  }
}