
import { SupabaseClient } from '@supabase/supabase-js'
import { getWeekBoundaries } from '@/lib/date-helpers'

interface Activity {
  strava_activity_id: number
  user_id: string
  start_date_local: string
  distance: number
  moving_time: number
  calories: number
  total_elevation_gain: number
  average_speed: number
  type: string
  sport_type: string
  suffer_score?: number
  photo_count?: number
}

interface BadgeCriteria {
  type: string;
  condition?: string;
  bronze: number;
  silver: number;
  gold: number;
  metric?: string;
  activity_type?: string;
  reset_period?: 'weekly' | 'monthly' | 'yearly';
  sports_list?: string[];
}

interface Badge {
  id: string
  code: string
  name: string
  emoji: string
  criteria: BadgeCriteria
  start_date?: string | null
  end_date?: string | null
}

interface BadgeProgress {
  user_id: string;
  badge_id: string;
  current_value: number;
  bronze_achieved: boolean;
  silver_achieved: boolean;
  gold_achieved: boolean;
  last_activity_id?: number;
  last_updated?: string;
  metadata?: { 
    sports?: string[];
    counted_weeks?: string[];
  };
  period_start?: string;
  period_end?: string;
  last_reset_at?: string;
}


export class BadgeCalculator {
  constructor(private supabase: SupabaseClient) {}

  private async getCurrentPeriod(resetPeriod: string | undefined, activityDate: string, timezone: string) {
    if (!resetPeriod) return { start: null, end: null }
    
    if (resetPeriod === 'weekly') {
      const { weekStart, weekEnd } = getWeekBoundaries(new Date(activityDate), timezone)
      return {
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0]
      }
    }
    
    // Add monthly/yearly support in the future if needed
    return { start: null, end: null }
  }

  async calculateBadgesForActivity(activity: Activity) {
    console.log(`[BadgeCalculator] Starting badge calculation for activity ${activity.strava_activity_id}`)
    
    const { data: badges, error: badgesError } = await this.supabase
      .from('badges')
      .select('*')
      .eq('active', true)

    if (badgesError) {
      console.error('[BadgeCalculator] Error fetching badges:', badgesError)
      return
    }

    if (!badges) {
      console.log('[BadgeCalculator] No active badges found')
      return
    }

    console.log(`[BadgeCalculator] Found ${badges.length} active badges to evaluate`)

    const { data: profile } = await this.supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', activity.user_id)
      .single()

    const timezone = profile?.timezone || 'UTC'

    for (const badge of badges) {
      console.log(`[BadgeCalculator] Evaluating badge: ${badge.name} (${badge.code})`)
      try {
        await this.evaluateBadge(badge, activity, timezone)
      } catch (error) {
        console.error(`[BadgeCalculator] Error evaluating badge ${badge.code}:`, error)
      }
    }
    
    console.log(`[BadgeCalculator] Completed badge calculation for activity ${activity.strava_activity_id}`)
  }

  private async evaluateBadge(badge: Badge, activity: Activity, timezone: string) {
    const { criteria } = badge
    const userId = activity.user_id
    
    // Check if activity date is within badge's active date range
    const activityDate = new Date(activity.start_date_local)
    
    if (badge.start_date) {
      const startDate = new Date(badge.start_date)
      if (activityDate < startDate) {
        return // Activity is before badge start date
      }
    }
    
    if (badge.end_date) {
      const endDate = new Date(badge.end_date)
      endDate.setHours(23, 59, 59, 999) // Include the entire end date
      if (activityDate > endDate) {
        return // Activity is after badge end date
      }
    }

    const period = await this.getCurrentPeriod(criteria.reset_period, activity.start_date_local, timezone)
    
    let progressQuery = this.supabase
      .from('badge_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
    
    if (period.start) {
      progressQuery = progressQuery.eq('period_start', period.start)
    } else {
      progressQuery = progressQuery.is('period_start', null)
    }
    
    const { data: progress } = await progressQuery.single()

    const currentProgress: BadgeProgress = progress || {
      user_id: userId,
      badge_id: badge.id,
      current_value: 0,
      bronze_achieved: false,
      silver_achieved: false,
      gold_achieved: false,
      period_start: period.start,
      period_end: period.end
    }

    switch (criteria.type) {
      case 'count':
        await this.handleCountBadge(badge, activity, currentProgress, timezone)
        break
      case 'cumulative':
        await this.handleCumulativeBadge(badge, activity, currentProgress, timezone)
        break
      case 'single_activity':
        await this.handleSingleActivityBadge(badge, activity, currentProgress, timezone)
        break
      case 'weekly_streak':
        await this.handleWeeklyStreakBadge(badge, activity, currentProgress, timezone)
        break
      case 'unique_sports':
        await this.handleVarietyBadge(badge, activity, currentProgress, timezone)
        break
      case 'weekly_cumulative':
        await this.handleWeeklyCumulativeBadge(badge, activity, currentProgress, timezone)
        break
      case 'weekly_count':
        await this.handleWeeklyCountBadge(badge, activity, currentProgress, timezone)
        break
    }
  }

  private async handleCountBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge
    let qualifies = false

    if (criteria.condition === 'start_hour < 7') {
      const hour = new Date(activity.start_date_local).getHours()
      qualifies = hour < 7
    } else if (criteria.condition === 'start_hour >= 21') {
      const hour = new Date(activity.start_date_local).getHours()
      qualifies = hour >= 21
    }

    if (qualifies) {
      progress.current_value += 1

      const tierAchieved = this.checkTierProgress(progress.current_value, criteria, progress)

      if (tierAchieved) {
        await this.awardBadge(badge, activity, tierAchieved, progress.current_value)
      }

      await this.supabase.from('badge_progress').upsert({ ...progress })
    }
  }

  private async handleCumulativeBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge
    console.log(`[BadgeCalculator] Handling cumulative badge: ${badge.code}`)
    
    // For cumulative badges (no reset period), we need to recalculate from all activities
    // to avoid double-counting when activities are reprocessed
    
    // Get all activities for this user
    let query = this.supabase
      .from('strava_activities')
      .select('*')
      .eq('user_id', activity.user_id)
      .is('deleted_at', null)
    
    // Filter by activity type if specified
    if (criteria.activity_type) {
      query = query.eq('type', criteria.activity_type)
    }
    
    const { data: allActivities, error: queryError } = await query
    
    if (queryError) {
      console.error(`[BadgeCalculator] Error fetching activities for ${badge.code}:`, queryError)
      return
    }
    
    if (!allActivities) {
      console.error(`[BadgeCalculator] No activities returned for cumulative badge ${badge.code}`)
      return
    }
    
    console.log(`[BadgeCalculator] Found ${allActivities.length} activities for ${badge.code}`)
    
    // Calculate total value from all activities
    let totalValue = 0
    for (const act of allActivities) {
      switch (criteria.metric) {
        case 'distance_km':
          totalValue += (act.distance || 0) / 1000
          break
        case 'elevation_gain':
          totalValue += act.total_elevation_gain || 0
          break
      }
    }
    
    // Update progress with the recalculated total
    progress.current_value = totalValue
    progress.last_activity_id = activity.strava_activity_id
    progress.last_updated = new Date().toISOString()

    const tierAchieved = this.checkTierProgress(progress.current_value, criteria, progress)

    if (tierAchieved) {
      await this.awardBadge(badge, activity, tierAchieved, progress.current_value)
    }

    await this.supabase.from('badge_progress').upsert({ ...progress })
  }

  private async handleSingleActivityBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge
    let value = 0

    // Check activity type - support both type and sport_type fields
    if (criteria.activity_type) {
      if (activity.type !== criteria.activity_type && activity.sport_type !== criteria.activity_type) {
        return
      }
    }

    switch (criteria.metric) {
      case 'calories_per_hour':
        const hours = activity.moving_time / 3600
        value = hours > 0 ? (activity.calories || 0) / hours : 0
        break
      case 'average_speed_kmh':
        value = (activity.average_speed || 0) * 3.6
        break
      case 'moving_time_minutes':
        value = (activity.moving_time || 0) / 60
        break
    }

    let tierAchieved = null
    if (!progress.gold_achieved && value >= criteria.gold) tierAchieved = 'gold'
    else if (!progress.silver_achieved && value >= criteria.silver) tierAchieved = 'silver'
    else if (!progress.bronze_achieved && value >= criteria.bronze) tierAchieved = 'bronze'

    if (tierAchieved) {
      await this.awardBadge(badge, activity, tierAchieved, value)

      if (tierAchieved === 'bronze') progress.bronze_achieved = true;
      if (tierAchieved === 'silver') progress.silver_achieved = true;
      if (tierAchieved === 'gold') progress.gold_achieved = true;

      await this.supabase.from('badge_progress').upsert({ ...progress, current_value: Math.max(progress.current_value, value) })
    }
  }

  private async handleWeeklyStreakBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    // Use weekly_exercise_tracking instead of deprecated user_points
    const { data: weeklyRows } = await this.supabase
      .from('weekly_exercise_tracking')
      .select('week_start, hours_logged')
      .eq('user_id', activity.user_id)
      .order('week_start', { ascending: false })

    if (!weeklyRows || weeklyRows.length === 0) return

    let streak = 0
    let lastWeek: Date | null = null

    for (const row of weeklyRows) {
      if ((row.hours_logged || 0) <= 0) {
        // Streak breaks on a week without activity
        if (streak > 0) break
        else continue
      }
      const weekDate = new Date(row.week_start)
      if (!lastWeek) {
        streak = 1
        lastWeek = weekDate
      } else {
        const diffDays = Math.round((lastWeek.getTime() - weekDate.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays === 7) {
          streak++
          lastWeek = weekDate
        } else {
          break
        }
      }
    }

    progress.current_value = streak
    const tierAchieved = this.checkTierProgress(streak, badge.criteria, progress)

    if (tierAchieved) {
      await this.awardBadge(badge, activity, tierAchieved, streak)
    }

    await this.supabase.from('badge_progress').upsert({ ...progress })
  }

  private async handleVarietyBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge
    
    // Check if this badge is looking for specific sports (Net Gain badge)
    if (criteria.sports_list && criteria.sports_list.length > 0) {
      const { data: activities } = await this.supabase
        .from('strava_activities')
        .select('sport_type')
        .eq('user_id', activity.user_id)
        .in('sport_type', criteria.sports_list)
        .is('deleted_at', null)
      
      if (!activities) return
      
      const uniqueSports = new Set(activities.map(a => a.sport_type))
      const count = uniqueSports.size
      progress.current_value = count
      
      const tierAchieved = this.checkTierProgress(count, badge.criteria, progress)
      
      if (tierAchieved) {
        await this.awardBadge(badge, activity, tierAchieved, count)
      }
      
      await this.supabase.from('badge_progress').upsert({ ...progress, metadata: { sports: Array.from(uniqueSports) } })
    } else {
      // Original variety pack logic
      const { data: uniqueSports } = await this.supabase
        .from('strava_activities')
        .select('sport_type')
        .eq('user_id', activity.user_id)
        .is('deleted_at', null)

      if (!uniqueSports) return

      const uniqueTypes = new Set(uniqueSports.map(s => s.sport_type))
      const count = uniqueTypes.size
      progress.current_value = count

      const tierAchieved = this.checkTierProgress(count, badge.criteria, progress)

      if (tierAchieved) {
        await this.awardBadge(badge, activity, tierAchieved, count)
      }

      await this.supabase.from('badge_progress').upsert({ ...progress, metadata: { sports: Array.from(uniqueTypes) } })
    }
  }

  private async handleWeeklyCumulativeBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge
    console.log(`[BadgeCalculator] Handling weekly cumulative badge: ${badge.code}`)
    
    // For weekly cumulative badges, we need to recalculate from all activities in the week
    // This ensures we get the correct total, not just increment from the last value
    const period = await this.getCurrentPeriod('weekly', activity.start_date_local, timezone)
    
    if (!period.start || !period.end) {
      console.error(`[BadgeCalculator] Failed to get week boundaries for ${badge.code}`)
      return
    }
    
    console.log(`[BadgeCalculator] Week period for ${badge.code}: ${period.start} to ${period.end}`)
    
    // Get all activities for this week
    let query = this.supabase
      .from('strava_activities')
      .select('*')
      .eq('user_id', activity.user_id)
      .gte('start_date_local', period.start)
      .lte('start_date_local', period.end + 'T23:59:59')
      .is('deleted_at', null)
    
    // Filter by activity type if specified
    if (criteria.activity_type) {
      // Use OR condition to check both type and sport_type
      query = query.or(`type.eq.${criteria.activity_type},sport_type.eq.${criteria.activity_type}`)
    }
    
    const { data: weekActivities, error: queryError } = await query
    
    if (queryError) {
      console.error(`[BadgeCalculator] Error fetching week activities for ${badge.code}:`, queryError)
      return
    }
    
    if (!weekActivities) {
      console.error(`[BadgeCalculator] No activities returned for weekly badge ${badge.code}`)
      return
    }
    
    console.log(`[BadgeCalculator] Found ${weekActivities.length} activities for ${badge.code} this week`)
    
    // Calculate total value for the week
    let totalValue = 0
    for (const act of weekActivities) {
      let actValue = 0
      
      switch (criteria.metric) {
        case 'suffer_score':
          actValue = act.suffer_score || 0
          break
        case 'distance_miles':
          actValue = (act.distance || 0) / 1609.34 // Convert meters to miles
          break
        case 'moving_time_hours':
          actValue = (act.moving_time || 0) / 3600 // Convert seconds to hours
          break
        case 'moving_time_minutes':
          actValue = (act.moving_time || 0) / 60 // Convert seconds to minutes
          break
      }
      
      totalValue += actValue
    }
    
    // Update progress with the recalculated total
    progress.current_value = totalValue
    
    const tierAchieved = this.checkTierProgress(progress.current_value, criteria, progress)

    if (tierAchieved) {
      await this.awardBadge(badge, activity, tierAchieved, progress.current_value)
    }

    await this.supabase.from('badge_progress').upsert({ ...progress })
  }

  private async handleWeeklyCountBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge
    
    // For Belfie badge - count weeks with photos
    if (criteria.condition === 'photo_count > 0') {
      if ((activity.photo_count || 0) > 0) {
        // Check if this week has already been counted
        const weekKey = progress.period_start || 'no_period'
        const metadata = progress.metadata || {}
        const countedWeeks = metadata.counted_weeks || []
        
        if (!countedWeeks.includes(weekKey)) {
          countedWeeks.push(weekKey)
          progress.current_value = countedWeeks.length
          progress.metadata = { ...metadata, counted_weeks: countedWeeks }
          
          const tierAchieved = this.checkTierProgress(progress.current_value, criteria, progress)
          
          if (tierAchieved) {
            await this.awardBadge(badge, activity, tierAchieved, progress.current_value)
          }
          
          await this.supabase.from('badge_progress').upsert({ ...progress })
        }
      }
    }
  }

  private checkTierProgress(value: number, criteria: BadgeCriteria, progress: BadgeProgress): string | null {
    if (!progress.gold_achieved && value >= criteria.gold) return 'gold'
    if (!progress.silver_achieved && value >= criteria.silver) return 'silver'
    if (!progress.bronze_achieved && value >= criteria.bronze) return 'bronze'
    return null
  }

  private async awardBadge(badge: Badge, activity: Activity, tier: string, value: number) {
    const tierPoints: { [key: string]: number } = { bronze: 3, silver: 6, gold: 15 }
    const { data: existing } = await this.supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', activity.user_id)
      .eq('badge_id', badge.id)
      .single()

    let pointsToAward = 0

    if (existing) {
      const tierOrder: { [key: string]: number } = { bronze: 1, silver: 2, gold: 3 }
      if (tierOrder[tier] > tierOrder[existing.tier]) {
        const previousPoints = existing.points_awarded || 0
        pointsToAward = tierPoints[tier] - previousPoints
        
        await this.supabase
          .from('user_badges')
          .update({ tier, progress_value: value, points_awarded: tierPoints[tier] })
          .eq('id', existing.id)
      }
    } else {
      pointsToAward = tierPoints[tier]
      await this.supabase
        .from('user_badges')
        .insert({ user_id: activity.user_id, badge_id: badge.id, tier, progress_value: value, points_awarded: tierPoints[tier] })
    }
    
    if (pointsToAward > 0) {
      // Call the new RPC function to increment the cumulative score
      const { error: rpcError } = await this.supabase.rpc('increment_badge_points', {
        p_user_id: activity.user_id,
        p_points_to_add: pointsToAward
      })

      if (rpcError) {
        console.error(`[BadgeCalculator] Error incrementing badge points for user ${activity.user_id}:`, rpcError)
      } else {
        console.log(`Awarded ${pointsToAward} cumulative badge points to user ${activity.user_id}`)
      }
    }
  }
}
