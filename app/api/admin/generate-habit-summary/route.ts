import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateHabitSummary } from '@/lib/habits/weekly-summary-generator'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin access
    const isAdmin = user.email === 'gabrielbeal@gmail.com' ||
                    user.user_metadata?.full_name === 'Gabriel Beal' ||
                    user.user_metadata?.name === 'Gabriel Beal'

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Get week offset from request (default to 0 for last completed week)
    const body = await request.json()
    const weekOffset = body.weekOffset || 0

    // Generate the summary
    const summary = await generateHabitSummary(weekOffset)

    return NextResponse.json({
      success: true,
      summary
    })
  } catch (error) {
    console.error('Error generating habit summary:', error)
    return NextResponse.json({
      error: 'Failed to generate habit summary'
    }, { status: 500 })
  }
}