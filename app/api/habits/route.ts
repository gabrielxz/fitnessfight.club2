import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper to get week start (Sunday)
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

// GET /api/habits - Get user's habits with current week status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get weeks parameter for history
    const { searchParams } = new URL(request.url)
    const weeksToFetch = parseInt(searchParams.get('weeks') || '1')
    
    // Calculate date ranges
    const now = new Date()
    const currentWeekStart = getWeekStart(now)
    const oldestWeekStart = new Date(currentWeekStart)
    oldestWeekStart.setDate(oldestWeekStart.getDate() - (7 * (weeksToFetch - 1)))

    // Get user's active habits
    const { data: habits, error: habitsError } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })

    if (habitsError) {
      console.error('Error fetching habits:', habitsError)
      return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 })
    }

    if (!habits || habits.length === 0) {
      return NextResponse.json({ habits: [], weeks: [] })
    }

    const habitIds = habits.map(h => h.id)

    // Get habit entries for the requested weeks
    const { data: entries, error: entriesError } = await supabase
      .from('habit_entries')
      .select('*')
      .in('habit_id', habitIds)
      .gte('week_start', oldestWeekStart.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (entriesError) {
      console.error('Error fetching entries:', entriesError)
      return NextResponse.json({ error: 'Failed to fetch habit entries' }, { status: 500 })
    }

    // Get weekly summaries
    const { data: summaries, error: summariesError } = await supabase
      .from('habit_weekly_summaries')
      .select('*')
      .in('habit_id', habitIds)
      .gte('week_start', oldestWeekStart.toISOString().split('T')[0])
      .order('week_start', { ascending: false })

    if (summariesError) {
      console.error('Error fetching summaries:', summariesError)
    }

    // Organize data by week
    interface WeeklyHabitData {
      weekStart: string
      weekEnd: string
      habits: Array<typeof habits[0] & {
        entries: typeof entries
        summary: {
          successes: number
          target: number
          percentage: number
        }
      }>
    }
    const weeklyData: WeeklyHabitData[] = []
    for (let i = 0; i < weeksToFetch; i++) {
      const weekStart = new Date(currentWeekStart)
      weekStart.setDate(weekStart.getDate() - (7 * i))
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      const weekData = {
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0],
        habits: habits.map(habit => {
          // Get entries for this habit and week
          const weekEntries = entries?.filter(e => 
            e.habit_id === habit.id && 
            e.week_start === weekStart.toISOString().split('T')[0]
          ) || []

          // Get summary for this habit and week
          const summary = summaries?.find(s => 
            s.habit_id === habit.id && 
            s.week_start === weekStart.toISOString().split('T')[0]
          )

          // Calculate current week progress
          const successCount = weekEntries.filter(e => e.status === 'SUCCESS').length

          return {
            ...habit,
            entries: weekEntries,
            summary: summary || {
              successes: successCount,
              target: habit.target_frequency,
              percentage: habit.target_frequency > 0 ? (successCount / habit.target_frequency) * 100 : 0
            }
          }
        })
      }

      weeklyData.push(weekData)
    }

    return NextResponse.json({ 
      habits,
      weeks: weeklyData,
      currentDate: now.toISOString().split('T')[0]
    })
  } catch (error) {
    console.error('Error in GET /api/habits:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/habits - Create new habit
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, target_frequency } = body

    // Validate input
    if (!name || !target_frequency) {
      return NextResponse.json({ error: 'Name and target frequency are required' }, { status: 400 })
    }

    if (name.length > 100) {
      return NextResponse.json({ error: 'Name must be 100 characters or less' }, { status: 400 })
    }

    if (target_frequency < 1 || target_frequency > 7) {
      return NextResponse.json({ error: 'Target frequency must be between 1 and 7' }, { status: 400 })
    }

    // Get the max position for ordering
    const { data: existingHabits } = await supabase
      .from('habits')
      .select('position')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('position', { ascending: false })
      .limit(1)

    const nextPosition = existingHabits && existingHabits.length > 0 
      ? (existingHabits[0].position || 0) + 1 
      : 0

    // Create the habit
    const { data: habit, error } = await supabase
      .from('habits')
      .insert({
        user_id: user.id,
        name,
        target_frequency,
        position: nextPosition
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating habit:', error)
      return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 })
    }

    return NextResponse.json({ habit })
  } catch (error) {
    console.error('Error in POST /api/habits:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}