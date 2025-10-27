import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekBoundaries } from '@/lib/date-helpers'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's timezone for timezone-aware week calculation
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', user.id)
    .single()

  const userTimezone = profile?.timezone || 'America/New_York'

  // Get current week for filtering weekly badges (timezone-aware)
  const { weekStart } = getWeekBoundaries(new Date(), userTimezone)
  const currentWeekStart = weekStart.toISOString().split('T')[0]

  // Get all badges first
  const { data: allBadges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true)

  if (!allBadges) {
    return NextResponse.json([])
  }

  // Get progress for all badges, handling both periodic and cumulative
  const progressPromises = allBadges.map(async (badge) => {
    const isWeekly = badge.criteria?.reset_period === 'weekly'
    
    let query = supabase
      .from('badge_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('badge_id', badge.id)
    
    // For weekly badges, get current week's progress
    if (isWeekly) {
      query = query.eq('period_start', currentWeekStart)
    } else {
      query = query.is('period_start', null)
    }
    
    const { data: progress } = await query.single()
    
    return {
      badge,
      progress: progress || {
        current_value: 0,
        bronze_achieved: false,
        silver_achieved: false,
        gold_achieved: false,
        period_start: isWeekly ? currentWeekStart : null
      }
    }
  })

  const progressWithBadges = await Promise.all(progressPromises)

  // Also get user's earned badges
  const { data: earnedBadges } = await supabase
    .from('user_badges')
    .select('badge_id, tier')
    .eq('user_id', user.id)

  const earnedBadgeMap = new Map(
    earnedBadges?.map(eb => [eb.badge_id, eb.tier]) || []
  )

  const formattedProgress = progressWithBadges.map(item => {
    const { badge, progress } = item
    const { criteria } = badge
    const earnedTier = earnedBadgeMap.get(badge.id)
    
    let next_tier = null
    let next_tier_target = null
    let percentage = 0

    // Determine next tier based on what's been achieved
    if (!earnedTier || earnedTier === 'bronze') {
      if (!earnedTier) {
        next_tier = 'bronze'
        next_tier_target = criteria.bronze
      } else {
        next_tier = 'silver'
        next_tier_target = criteria.silver
      }
    } else if (earnedTier === 'silver') {
      next_tier = 'gold'
      next_tier_target = criteria.gold
    }

    if (next_tier_target) {
      percentage = (progress.current_value / next_tier_target) * 100
    } else {
      percentage = 100
    }

    // Format display based on metric type
    let unit = ''
    if (criteria.metric === 'distance_km') {
      unit = 'km'
    } else if (criteria.metric === 'distance_miles') {
      unit = 'miles'
    } else if (criteria.metric === 'elevation_gain') {
      unit = 'm'
    } else if (criteria.metric === 'moving_time_hours') {
      unit = 'hours'
    } else if (criteria.metric === 'moving_time_minutes') {
      unit = 'minutes'
    } else if (criteria.metric === 'athlete_count') {
      unit = 'athletes'
    } else if (criteria.type === 'count') {
      unit = criteria.condition?.includes('hour') ? 'activities' : 'activities'
    } else if (criteria.type === 'weekly_streak') {
      unit = 'weeks'
    } else if (criteria.type === 'weekly_count') {
      unit = 'weeks'
    } else if (criteria.type === 'unique_sports') {
      unit = 'sports'
    } else if (criteria.type === 'habit_weeks') {
      unit = 'weeks'
    } else if (criteria.type === 'activity_weeks') {
      unit = 'weeks'
    }

    return {
      badge: {
        id: badge.id,
        code: badge.code,
        name: badge.name,
        emoji: badge.emoji,
        category: badge.category,
        criteria: badge.criteria
      },
      current_value: progress.current_value,
      earned_tier: earnedTier || null,
      next_tier,
      next_tier_target,
      percentage: Math.min(100, percentage),
      unit,
      is_periodic: !!criteria.reset_period,
      period_label: criteria.reset_period === 'weekly' ? 'This Week' : null
    }
  })

  // Sort by category and percentage
  formattedProgress.sort((a, b) => {
    // Prioritize badges with progress
    if (a.percentage > 0 && b.percentage === 0) return -1
    if (b.percentage > 0 && a.percentage === 0) return 1
    // Then by percentage
    if (a.percentage !== b.percentage) return b.percentage - a.percentage
    // Then by category
    return (a.badge.category || '').localeCompare(b.badge.category || '')
  })

  return NextResponse.json(formattedProgress)
}