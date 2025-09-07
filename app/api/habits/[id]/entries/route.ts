import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper to get week start (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  // If Sunday (0), treat as end of week (day 7)
  const adjustedDay = day === 0 ? 7 : day
  // Calculate days back to Monday (1)
  const diff = d.getUTCDate() - (adjustedDay - 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

// POST /api/habits/[id]/entries - Set habit status for a date
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { date, status } = body

    // Validate input
    if (!date || !status) {
      return NextResponse.json({ error: 'Date and status are required' }, { status: 400 })
    }

    if (!['SUCCESS', 'FAILURE', 'NEUTRAL'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Verify habit belongs to user
    const { data: habit, error: habitError } = await supabase
      .from('habits')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (habitError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 })
    }

    // Calculate week start for this date
    const entryDate = new Date(date)
    const weekStart = getWeekStart(entryDate)

    // Check if entry exists
    const { data: existing, error: checkError } = await supabase
      .from('habit_entries')
      .select('*')
      .eq('habit_id', params.id)
      .eq('date', date)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking existing entry:', checkError)
      return NextResponse.json({ error: 'Failed to check entry' }, { status: 500 })
    }

    let entry

    if (existing) {
      if (status === 'NEUTRAL') {
        // Delete the entry if setting back to neutral
        const { error: deleteError } = await supabase
          .from('habit_entries')
          .delete()
          .eq('id', existing.id)

        if (deleteError) {
          console.error('Error deleting entry:', deleteError)
          return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
        }

        entry = null
      } else {
        // Update existing entry
        const { data: updated, error: updateError } = await supabase
          .from('habit_entries')
          .update({ status })
          .eq('id', existing.id)
          .select()
          .single()

        if (updateError) {
          console.error('Error updating entry:', updateError)
          return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
        }

        entry = updated
      }
    } else if (status !== 'NEUTRAL') {
      // Create new entry (only if not neutral)
      const { data: created, error: createError } = await supabase
        .from('habit_entries')
        .insert({
          habit_id: params.id,
          date,
          status,
          week_start: weekStart.toISOString().split('T')[0]
        })
        .select()
        .single()

      if (createError) {
        console.error('Error creating entry:', createError)
        return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
      }

      entry = created
    }

    // Update weekly summary
    const { data: weekEntries } = await supabase
      .from('habit_entries')
      .select('*')
      .eq('habit_id', params.id)
      .eq('week_start', weekStart.toISOString().split('T')[0])

    const successCount = weekEntries?.filter(e => e.status === 'SUCCESS').length || 0
    const percentage = habit.target_frequency > 0 
      ? Math.round((successCount / habit.target_frequency) * 100 * 100) / 100
      : 0

    // Check if summary exists
    const { data: existingSummary } = await supabase
      .from('habit_weekly_summaries')
      .select('*')
      .eq('habit_id', params.id)
      .eq('week_start', weekStart.toISOString().split('T')[0])
      .maybeSingle()

    if (existingSummary) {
      // Update existing summary
      await supabase
        .from('habit_weekly_summaries')
        .update({
          successes: successCount,
          percentage
        })
        .eq('id', existingSummary.id)
    } else {
      // Create new summary
      await supabase
        .from('habit_weekly_summaries')
        .insert({
          habit_id: params.id,
          user_id: user.id,
          week_start: weekStart.toISOString().split('T')[0],
          successes: successCount,
          target: habit.target_frequency,
          percentage
        })
    }

    return NextResponse.json({ 
      entry,
      summary: {
        successes: successCount,
        target: habit.target_frequency,
        percentage
      }
    })
  } catch (error) {
    console.error('Error in POST /api/habits/[id]/entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}