import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/habits/verify - This endpoint is deprecated after the cumulative points refactor
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // This endpoint was used to verify habit_weekly_summaries table data
    // That table has been dropped in the cumulative points refactor
    // Habit points are now calculated on-the-fly and added to cumulative totals

    return NextResponse.json({
      success: true,
      message: 'Verification endpoint is deprecated. Habit points are now managed through the cumulative points system.',
      deprecated: true
    })

  } catch (error) {
    console.error('[VERIFY] Unexpected error:', error)
    return NextResponse.json({
      error: 'This endpoint is deprecated',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}