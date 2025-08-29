'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteUser(userId: string) {
  const supabase = await createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.email !== 'gabrielbeal@gmail.com' && 
                 user.user_metadata?.full_name !== 'Gabriel Beal' &&
                 user.user_metadata?.name !== 'Gabriel Beal')) {
    throw new Error('Unauthorized')
  }

  // Delete from strava_connections (will cascade to other tables)
  const { error: stravaError } = await supabase
    .from('strava_connections')
    .delete()
    .eq('user_id', userId)

  if (stravaError) {
    console.error('Error deleting from strava_connections:', stravaError)
  }

  // Delete from user_divisions
  const { error: divisionError } = await supabase
    .from('user_divisions')
    .delete()
    .eq('user_id', userId)

  if (divisionError) {
    console.error('Error deleting from user_divisions:', divisionError)
  }

  // Delete from user_badges
  const { error: badgeError } = await supabase
    .from('user_badges')
    .delete()
    .eq('user_id', userId)

  if (badgeError) {
    console.error('Error deleting from user_badges:', badgeError)
  }

  // Delete from user_points
  const { error: pointsError } = await supabase
    .from('user_points')
    .delete()
    .eq('user_id', userId)

  if (pointsError) {
    console.error('Error deleting from user_points:', pointsError)
  }

  // Note: Deleting from auth.users requires service role key which we don't have in browser context
  // The user will remain in auth.users but all their app data is deleted

  revalidatePath('/admin')
}

export async function assignBadge(userId: string, badgeId: string, tier: 'bronze' | 'silver' | 'gold') {
  const supabase = await createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.email !== 'gabrielbeal@gmail.com' && 
                 user.user_metadata?.full_name !== 'Gabriel Beal' &&
                 user.user_metadata?.name !== 'Gabriel Beal')) {
    throw new Error('Unauthorized')
  }

  try {
    // Check if user already has this badge
    const { data: existing, error: checkError } = await supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badgeId)
      .maybeSingle() // Use maybeSingle instead of single to avoid error if not found

    if (checkError) {
      console.error('Error checking existing badge:', checkError)
      throw checkError
    }

    if (existing) {
      // Update tier if it exists
      const { error } = await supabase
        .from('user_badges')
        .update({ tier, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (error) {
        console.error('Error updating badge:', error)
        throw error
      }
    } else {
      // Insert new badge
      const { error } = await supabase
        .from('user_badges')
        .insert({
          user_id: userId,
          badge_id: badgeId,
          tier,
          earned_at: new Date().toISOString()
        })

      if (error) {
        console.error('Error inserting badge:', error)
        throw error
      }
    }

    revalidatePath('/admin')
  } catch (error) {
    console.error('Error in assignBadge:', error)
    throw error
  }
}

export async function removeBadge(userBadgeId: string) {
  const supabase = await createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.email !== 'gabrielbeal@gmail.com' && 
                 user.user_metadata?.full_name !== 'Gabriel Beal' &&
                 user.user_metadata?.name !== 'Gabriel Beal')) {
    throw new Error('Unauthorized')
  }

  const { error } = await supabase
    .from('user_badges')
    .delete()
    .eq('id', userBadgeId)

  if (error) throw error

  revalidatePath('/admin')
}

export async function changeDivision(userId: string, divisionId: string) {
  const supabase = await createClient()
  
  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.email !== 'gabrielbeal@gmail.com' && 
                 user.user_metadata?.full_name !== 'Gabriel Beal' &&
                 user.user_metadata?.name !== 'Gabriel Beal')) {
    throw new Error('Unauthorized')
  }

  try {
    // Check if user has a division assignment
    const { data: existing, error: checkError } = await supabase
      .from('user_divisions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle() // Use maybeSingle to avoid error if not found

    if (checkError) {
      console.error('Error checking existing division:', checkError)
      throw checkError
    }

    if (existing) {
      // Record history of the change
      const { data: oldDivision } = await supabase
        .from('divisions')
        .select('*')
        .eq('id', existing.division_id)
        .single()

      const { data: newDivision } = await supabase
        .from('divisions')
        .select('*')
        .eq('id', divisionId)
        .single()

      if (oldDivision && newDivision) {
        // Insert division history record
        const { error: historyError } = await supabase
          .from('division_history')
          .insert({
            user_id: userId,
            from_division_id: oldDivision.id,
            to_division_id: newDivision.id,
            change_type: oldDivision.level < newDivision.level ? 'promotion' : 'relegation',
            change_reason: 'admin_manual',
            final_points: 0,
            final_position: 0,
            week_ending: new Date().toISOString()
          })
        
        if (historyError) {
          console.error('Error inserting division history:', historyError)
          // Don't throw, just log - history is not critical
        }
      }

      // Update the division
      const { error } = await supabase
        .from('user_divisions')
        .update({ 
          division_id: divisionId,
          joined_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      if (error) {
        console.error('Error updating division:', error)
        throw error
      }
    } else {
      // Insert new division assignment
      const { error } = await supabase
        .from('user_divisions')
        .insert({
          user_id: userId,
          division_id: divisionId,
          joined_at: new Date().toISOString()
        })

      if (error) {
        console.error('Error inserting division:', error)
        throw error
      }
    }

    revalidatePath('/admin')
  } catch (error) {
    console.error('Error in changeDivision:', error)
    throw error
  }
}