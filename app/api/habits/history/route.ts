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

// GET /api/habits/history - Get paginated weekly history
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const weeks = parseInt(searchParams.get('weeks') || '4')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Calculate date range
    const now = new Date()
    const currentWeekStart = getWeekStart(now)
    const startWeek = new Date(currentWeekStart)
    startWeek.setDate(startWeek.getDate() - (7 * (offset + weeks - 1)))
    const endWeek = new Date(currentWeekStart)
    endWeek.setDate(endWeek.getDate() - (7 * offset))

    // Get user's habits
    const { data: habits, error: habitsError } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })

    if (habitsError) {
      console.error('Error fetching habits:', habitsError)
      return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 })
    }

    if (!habits || habits.length === 0) {
      return NextResponse.json({ weeks: [] })
    }

    const habitIds = habits.map(h => h.id)

    // Get entries for the date range
    const { data: entries, error: entriesError } = await supabase
      .from('habit_entries')
      .select('*')
      .in('habit_id', habitIds)
      .gte('week_start', startWeek.toISOString().split('T')[0])
      .lte('week_start', endWeek.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (entriesError) {
      console.error('Error fetching entries:', entriesError)
      return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
    }

    // Get summaries for the date range
    const { data: summaries, error: summariesError } = await supabase
      .from('habit_weekly_summaries')
      .select('*')
      .in('habit_id', habitIds)
      .gte('week_start', startWeek.toISOString().split('T')[0])
      .lte('week_start', endWeek.toISOString().split('T')[0])
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
    for (let i = 0; i < weeks; i++) {
      const weekStart = new Date(currentWeekStart)
      weekStart.setDate(weekStart.getDate() - (7 * (offset + i)))
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      const weekData = {
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0],
        habits: habits
          .filter(h => new Date(h.created_at) <= weekEnd) // Only show habits that existed during this week
          .map(habit => {
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

            // Calculate progress if no summary exists
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

      if (weekData.habits.length > 0) {
        weeklyData.push(weekData)
      }
    }

    return NextResponse.json({ 
      weeks: weeklyData,
      hasMore: true // Could calculate this based on oldest habit creation date
    })
  } catch (error) {
    console.error('Error in GET /api/habits/history:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}