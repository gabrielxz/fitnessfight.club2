import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PackAnimalDetector } from '@/lib/badges/PackAnimalDetector'

export const maxDuration = 300 // 5 minutes max execution time

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[DailyBadgeCheck] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[DailyBadgeCheck] Invalid authorization')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[DailyBadgeCheck] Starting daily badge check...')

    const supabase = createAdminClient()

    // Run Pack Animal detection
    const detector = new PackAnimalDetector(supabase)
    await detector.detectAndAwardBadges(24, false) // Look back 24 hours, not a dry run

    // Future: Add other daily badge checks here
    // await checkOtherBadges()

    console.log('[DailyBadgeCheck] Daily badge check complete')

    return NextResponse.json({
      success: true,
      message: 'Daily badge check completed successfully'
    })
  } catch (error) {
    console.error('[DailyBadgeCheck] Error during daily badge check:', error)
    return NextResponse.json(
      { error: 'Daily badge check failed', details: String(error) },
      { status: 500 }
    )
  }
}
