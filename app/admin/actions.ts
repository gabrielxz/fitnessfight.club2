'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const TIER_POINTS = { bronze: 3, silver: 6, gold: 15 };

export async function deleteUser(userId: string) {
  const supabase = await createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.email !== 'gabrielbeal@gmail.com' && 
                 user.user_metadata?.full_name !== 'Gabriel Beal' &&
                 user.user_metadata?.name !== 'Gabriel Beal')) {
    throw new Error('Unauthorized')
  }

  const adminClient = createAdminClient()
  
  if (user.id === userId) {
    await supabase.auth.signOut()
  }

  // Cascade delete should handle most of this, but we explicitly clean up to be safe.
  const tablesToDeleteFrom = [
    'strava_activities',
    'strava_connections',
    'user_divisions',
    'division_history',
    'user_badges',
    'weekly_exercise_tracking', // New table
    'habit_entries',
    'habits'
  ];

  for (const table of tablesToDeleteFrom) {
    const { error } = await adminClient.from(table).delete().eq('user_id', userId)
    if (error) console.error(`Error deleting from ${table}:`, error)
  }

  // Delete from user_profiles
  const { error: profileError } = await adminClient.from('user_profiles').delete().eq('id', userId)
  if (profileError) console.error('Error deleting from user_profiles:', profileError)

  // Finally, delete the user from auth.users
  const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
  if (authError) {
    console.error('Error deleting from auth.users:', authError)
    throw new Error(`Failed to delete user account: ${authError.message}`)
  }

  revalidatePath('/admin')
}

export async function assignBadge(userId: string, badgeId: string, tier: 'bronze' | 'silver' | 'gold') {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.email !== 'gabrielbeal@gmail.com')) {
    throw new Error('Unauthorized')
  }

  const adminClient = createAdminClient()
  let pointsToAward = 0;

  const { data: existing } = await adminClient
    .from('user_badges')
    .select('id, tier, points_awarded')
    .eq('user_id', userId)
    .eq('badge_id', badgeId)
    .maybeSingle()

  const newPointsValue = TIER_POINTS[tier];

  if (existing) {
    // Badge exists, could be an upgrade/downgrade
    const previousPoints = existing.points_awarded || TIER_POINTS[existing.tier] || 0;
    pointsToAward = newPointsValue - previousPoints;

    const { error } = await adminClient
      .from('user_badges')
      .update({ tier, updated_at: new Date().toISOString(), points_awarded: newPointsValue })
      .eq('id', existing.id)
    if (error) throw error;

  } else {
    // New badge for this user
    pointsToAward = newPointsValue;
    const { error } = await adminClient
      .from('user_badges')
      .insert({
        user_id: userId,
        badge_id: badgeId,
        tier,
        earned_at: new Date().toISOString(),
        points_awarded: newPointsValue
      })
    if (error) throw error;
  }

  if (pointsToAward !== 0) {
    const { error: rpcError } = await adminClient.rpc('increment_badge_points', {
      p_user_id: userId,
      p_points_to_add: pointsToAward
    })
    if (rpcError) {
      console.error('Failed to update badge points after assignment:', rpcError)
    }
  }

  revalidatePath('/admin')
}

export async function removeBadge(userBadgeId: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.email !== 'gabrielbeal@gmail.com')) {
    throw new Error('Unauthorized')
  }

  const adminClient = createAdminClient()
  
  const { data: badge } = await adminClient
    .from('user_badges')
    .select('user_id, tier, points_awarded')
    .eq('id', userBadgeId)
    .single()
  
  if (!badge) throw new Error('Badge not found')

  const pointsToRemove = badge.points_awarded || TIER_POINTS[badge.tier] || 0;

  const { error } = await adminClient.from('user_badges').delete().eq('id', userBadgeId)
  if (error) throw error

  if (pointsToRemove !== 0) {
    const { error: rpcError } = await adminClient.rpc('increment_badge_points', {
      p_user_id: badge.user_id,
      p_points_to_add: -pointsToRemove // Subtract points
    })
    if (rpcError) {
      console.error('Failed to update badge points after deletion:', rpcError)
    }
  }

  revalidatePath('/admin')
}

export async function changeDivision(userId: string, divisionId: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.email !== 'gabrielbeal@gmail.com')) {
    throw new Error('Unauthorized')
  }

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('user_divisions')
    .update({ division_id: divisionId, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error) {
    console.error('Error changing division:', error)
    throw error
  }

  revalidatePath('/admin')
}
