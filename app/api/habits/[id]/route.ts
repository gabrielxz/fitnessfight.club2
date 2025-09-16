import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/habits/[id] - Update habit name/frequency
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, target_frequency } = body
    const { id } = await params

    const updateData: Record<string, string | number> = {}
    
    if (name !== undefined) {
      if (name.length > 100) {
        return NextResponse.json({ error: 'Name must be 100 characters or less' }, { status: 400 })
      }
      updateData.name = name
    }

    if (target_frequency !== undefined) {
      if (target_frequency < 1 || target_frequency > 7) {
        return NextResponse.json({ error: 'Target frequency must be between 1 and 7' }, { status: 400 })
      }
      updateData.target_frequency = target_frequency
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: habit, error } = await supabase
      .from('habits')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating habit:', error)
      return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 })
    }

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 })
    }

    // The logic to recalculate points here has been removed.
    // Points will be correctly updated the next time a user logs a SUCCESS entry for this habit.

    return NextResponse.json({ habit })
  } catch (error) {
    console.error('Error in PATCH /api/habits/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/habits/[id] - Soft delete habit
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Soft delete by setting archived_at
    const { data: habit, error } = await supabase
      .from('habits')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error deleting habit:', error)
      return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 })
    }

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/habits/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
