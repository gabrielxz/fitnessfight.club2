'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getSummaryParticipants() {
  // First check authorization with regular client
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  // Use admin client for data fetching
  const supabase = createAdminClient()

  const { data: participants, error } = await supabase
    .from('summary_participants')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching participants:', error)
    throw error
  }

  // Now fetch the related user_profiles and strava_connections data
  if (participants && participants.length > 0) {
    const userIds = participants.map(p => p.user_id)

    // Fetch user profiles
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds)

    // Fetch strava connections
    const { data: stravaConnections } = await supabase
      .from('strava_connections')
      .select('user_id, strava_firstname, strava_lastname')
      .in('user_id', userIds)

    // Merge the data
    const enrichedParticipants = participants.map(p => {
      const profile = profiles?.find(prof => prof.id === p.user_id)
      const stravaConn = stravaConnections?.find(sc => sc.user_id === p.user_id)

      return {
        ...p,
        user_profiles: profile || { id: p.user_id, full_name: null, email: null },
        strava_connections: stravaConn ? [stravaConn] : []
      }
    })

    return enrichedParticipants
  }

  return participants || []
}

export async function addSummaryParticipant(userId: string, displayName?: string) {
  // First check authorization with regular client
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  // Use admin client for data operations
  const supabase = createAdminClient()

  // Check if user already exists
  const { data: existing } = await supabase
    .from('summary_participants')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (existing) {
    throw new Error('User is already a participant')
  }

  // Get the max sort order
  const { data: maxOrder } = await supabase
    .from('summary_participants')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = maxOrder ? (maxOrder.sort_order + 1) : 0

  const { error } = await supabase
    .from('summary_participants')
    .insert({
      user_id: userId,
      display_name: displayName || null,
      sort_order: nextOrder
    })

  if (error) {
    console.error('Error adding participant:', error)
    throw error
  }

  return { success: true }
}

export async function removeSummaryParticipant(id: string) {
  // First check authorization with regular client
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  // Use admin client for data operations
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('summary_participants')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error removing participant:', error)
    throw error
  }

  return { success: true }
}

export async function updateSummaryParticipant(
  id: string,
  updates: {
    display_name?: string | null
    include_in_summary?: boolean
    sort_order?: number
  }
) {
  // First check authorization with regular client
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  // Use admin client for data operations
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('summary_participants')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating participant:', error)
    throw error
  }

  return { success: true }
}

export async function reorderSummaryParticipants(participantIds: string[]) {
  // First check authorization with regular client
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  // Use admin client for data operations
  const supabase = createAdminClient()

  // Update sort order for each participant
  for (let i = 0; i < participantIds.length; i++) {
    await supabase
      .from('summary_participants')
      .update({
        sort_order: i,
        updated_at: new Date().toISOString()
      })
      .eq('id', participantIds[i])
  }

  return { success: true }
}