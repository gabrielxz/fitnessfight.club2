
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
}

interface Badge {
  id: string
  code: string
  name: string
  emoji: string
  criteria: BadgeCriteria
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
  metadata?: { sports: string[] };
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
    const { data: badges } = await this.supabase
      .from('badges')
      .select('*')
      .eq('active', true)

    if (!badges) return

    const { data: profile } = await this.supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', activity.user_id)
      .single()

    const timezone = profile?.timezone || 'UTC'

    for (const badge of badges) {
      await this.evaluateBadge(badge, activity, timezone)
    }
  }

  private async evaluateBadge(badge: Badge, activity: Activity, timezone: string) {
    const { criteria } = badge
    const userId = activity.user_id

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
        await this.awardBadge(badge, activity, tierAchieved, progress.current_value, timezone)
      }

      await this.supabase.from('badge_progress').upsert({ ...progress })
    }
  }

  private async handleCumulativeBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge
    let increment = 0

    if (criteria.activity_type && activity.type !== criteria.activity_type) return

    switch (criteria.metric) {
      case 'distance_km':
        increment = (activity.distance || 0) / 1000
        break
      case 'elevation_gain':
        increment = activity.total_elevation_gain || 0
        break
    }

    progress.current_value += increment

    const tierAchieved = this.checkTierProgress(progress.current_value, criteria, progress)

    if (tierAchieved) {
      await this.awardBadge(badge, activity, tierAchieved, progress.current_value, timezone)
    }

    await this.supabase.from('badge_progress').upsert({ ...progress })
  }

  private async handleSingleActivityBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge
    let value = 0

    if (criteria.activity_type && activity.type !== criteria.activity_type) return

    switch (criteria.metric) {
      case 'calories_per_hour':
        const hours = activity.moving_time / 3600
        value = hours > 0 ? (activity.calories || 0) / hours : 0
        break
      case 'average_speed_kmh':
        value = (activity.average_speed || 0) * 3.6
        break
    }

    let tierAchieved = null
    if (!progress.gold_achieved && value >= criteria.gold) tierAchieved = 'gold'
    else if (!progress.silver_achieved && value >= criteria.silver) tierAchieved = 'silver'
    else if (!progress.bronze_achieved && value >= criteria.bronze) tierAchieved = 'bronze'

    if (tierAchieved) {
      await this.awardBadge(badge, activity, tierAchieved, value, timezone)

      if (tierAchieved === 'bronze') progress.bronze_achieved = true;
      if (tierAchieved === 'silver') progress.silver_achieved = true;
      if (tierAchieved === 'gold') progress.gold_achieved = true;

      await this.supabase.from('badge_progress').upsert({ ...progress, current_value: Math.max(progress.current_value, value) })
    }
  }

  private async handleWeeklyStreakBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { data: weeklyActivity } = await this.supabase
      .from('user_points')
      .select('week_start')
      .eq('user_id', activity.user_id)
      .gt('total_hours', 0)
      .order('week_start', { ascending: false })

    if (!weeklyActivity) return

    let streak = 0
    let lastWeek: Date | null = null

    for (const week of weeklyActivity) {
      const weekDate = new Date(week.week_start)
      if (!lastWeek) {
        streak = 1
        lastWeek = weekDate
      } else {
        const diffDays = (lastWeek.getTime() - weekDate.getTime()) / (1000 * 60 * 60 * 24)
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
      await this.awardBadge(badge, activity, tierAchieved, streak, timezone)
    }

    await this.supabase.from('badge_progress').upsert({ ...progress })
  }

  private async handleVarietyBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
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
      await this.awardBadge(badge, activity, tierAchieved, count, timezone)
    }

    await this.supabase.from('badge_progress').upsert({ ...progress, metadata: { sports: Array.from(uniqueTypes) } })
  }

  private checkTierProgress(value: number, criteria: BadgeCriteria, progress: BadgeProgress): string | null {
    if (!progress.gold_achieved && value >= criteria.gold) return 'gold'
    if (!progress.silver_achieved && value >= criteria.silver) return 'silver'
    if (!progress.bronze_achieved && value >= criteria.bronze) return 'bronze'
    return null
  }

  private async awardBadge(badge: Badge, activity: Activity, tier: string, value: number, timezone: string) {
    const tierPoints: { [key: string]: number } = { bronze: 3, silver: 6, gold: 10 }
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
      const { weekStart } = getWeekBoundaries(new Date(activity.start_date_local), timezone)
      const weekStartStr = weekStart.toISOString().split('T')[0]

      // Use a function to safely increment the badge_points
      await this.supabase.rpc('increment_badge_points', {
        p_user_id: activity.user_id,
        p_week_start: weekStartStr,
        p_points_to_add: pointsToAward
      })

      console.log(`Awarded ${pointsToAward} badge points to user ${activity.user_id} for week ${weekStartStr}`)
    }
  }
}
