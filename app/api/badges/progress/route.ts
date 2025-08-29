import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: progressData } = await supabase
    .from('badge_progress')
    .select(`
      *,
      badge:badges(*)
    `)
    .eq('user_id', user.id)

  if (!progressData) {
    return NextResponse.json([])
  }

  const formattedProgress = progressData.map(item => {
    const { criteria } = item.badge
    let next_tier = null
    let next_tier_target = null
    let percentage = 0

    if (!item.bronze_achieved) {
      next_tier = 'bronze'
      next_tier_target = criteria.bronze
    } else if (!item.silver_achieved) {
      next_tier = 'silver'
      next_tier_target = criteria.silver
    } else if (!item.gold_achieved) {
      next_tier = 'gold'
      next_tier_target = criteria.gold
    }

    if (next_tier_target) {
      percentage = (item.current_value / next_tier_target) * 100
    } else {
      percentage = 100
    }

    return {
      badge: {
        name: item.badge.name,
        emoji: item.badge.emoji,
        criteria: item.badge.criteria
      },
      current_value: item.current_value,
      next_tier,
      next_tier_target,
      percentage: Math.min(100, percentage)
    }
  })

  return NextResponse.json(formattedProgress)
}