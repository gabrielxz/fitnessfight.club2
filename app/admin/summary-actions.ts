'use server'

import { createClient } from '@/lib/supabase/server'

export async function getSummaryParticipants() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

  const { data: participants, error } = await supabase
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
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching participants:', error)
    throw error
  }

  return participants || []
}

export async function addSummaryParticipant(userId: string, displayName?: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== 'gabrielbeal@gmail.com') {
    throw new Error('Unauthorized')
  }

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