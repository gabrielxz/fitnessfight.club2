import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BadgeCalculator } from '@/lib/badges/BadgeCalculator'

// Helper to get the start of the *previous* week (Monday)
function getLastWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const adjustedDay = day === 0 ? 7 : day
  const diff = d.getUTCDate() - (adjustedDay - 1) - 7 // Go back 7 more days for last week
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('Starting weekly cron job...')
    const supabase = createAdminClient()

    const now = new Date()
    const lastWeekStart = getLastWeekStart(now)

    // Evaluate habit badges for last week
    console.log('Evaluating habit badges for last week...')
    const badgeCalculator = new BadgeCalculator(supabase)

    // Get all unique users with habits
    const { data: allHabitUsers } = await supabase
      .from('habits')
      .select('user_id')
      .is('archived_at', null)

    if (allHabitUsers) {
      const uniqueUserIds = [...new Set(allHabitUsers.map(h => h.user_id))]
      console.log(`Evaluating habit badges for ${uniqueUserIds.length} users...`)

      for (const userId of uniqueUserIds) {
        await badgeCalculator.evaluateHabitBadgesForWeek(userId, lastWeekStart)
      }
    }

    // Reset weekly badge progress
    const { data: weeklyBadges } = await supabase
      .from('badges')
      .select('id')
      .eq('active', true)
      .eq('criteria->>reset_period', 'weekly')

    if (weeklyBadges && weeklyBadges.length > 0) {
      const badgeIds = weeklyBadges.map(b => b.id)
      await supabase
        .from('badge_progress')
        .update({ last_reset_at: new Date().toISOString() })
        .in('badge_id', badgeIds)
        .lt('period_end', now.toISOString())
      console.log(`Reset progress for ${weeklyBadges.length} weekly badges`)
    }

    console.log('Weekly habit badges and badge reset completed')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in weekly cron job:', error)
    return NextResponse.json({ error: 'Weekly cron job failed' }, { status: 500 })
  }
}
