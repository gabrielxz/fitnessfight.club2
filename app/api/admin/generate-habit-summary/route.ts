import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin-auth'
import { generateHabitChallengeSummary } from '@/lib/habits/weekly-summary-generator'

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin access
    const isAdmin = isAdminUser(user)

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const summary = await generateHabitChallengeSummary()

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