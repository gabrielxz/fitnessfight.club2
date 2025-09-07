import { SupabaseClient } from '@supabase/supabase-js'

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

  // Helper functions for period calculations
  private getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getUTCDay()
    // If Sunday (0), treat as end of week (day 7)
    const adjustedDay = day === 0 ? 7 : day
    // Calculate days back to Monday (1)
    const diff = d.getUTCDate() - (adjustedDay - 1)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
  }

  private getWeekEnd(weekStart: Date): Date {
    const end = new Date(weekStart)
    end.setUTCDate(end.getUTCDate() + 6)
    end.setUTCHours(23, 59, 59, 999)
    return end
  }

  private getCurrentPeriod(resetPeriod: string | undefined, activityDate: string) {
    if (!resetPeriod) return { start: null, end: null }
    
    const date = new Date(activityDate)
    
    if (resetPeriod === 'weekly') {
      const start = this.getWeekStart(date)
      const end = this.getWeekEnd(start)
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      }
    }
    
    // Add monthly/yearly support in the future if needed
    return { start: null, end: null }
  }

  async calculateBadgesForActivity(activity: Activity) {
    // Get all active badges
    const { data: badges } = await this.supabase
      .from('badges')
      .select('*')
      .eq('active', true)

    if (!badges) return

    for (const badge of badges) {
      await this.evaluateBadge(badge, activity)
    }
  }

  private async evaluateBadge(badge: Badge, activity: Activity) {
    const { criteria } = badge
    const userId = activity.user_id

    // Get current period if this is a periodic badge
    const period = this.getCurrentPeriod(criteria.reset_period, activity.start_date_local)
    
    // Build query for progress record
    let progressQuery = this.supabase
      .from('badge_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
    
    // For periodic badges, filter by period
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

    // Calculate based on badge type
    switch (criteria.type) {
      case 'count':
        await this.handleCountBadge(badge, activity, currentProgress)
        break
      case 'cumulative':
        await this.handleCumulativeBadge(badge, activity, currentProgress)
        break
      case 'single_activity':
        await this.handleSingleActivityBadge(badge, activity, currentProgress)
        break
      case 'weekly_streak':
        await this.handleWeeklyStreakBadge(badge, activity, currentProgress)
        break
      case 'unique_sports':
        await this.handleVarietyBadge(badge, activity, currentProgress)
        break
    }
  }

  private async handleCountBadge(badge: Badge, activity: Activity, progress: BadgeProgress) {
    const { criteria } = badge
    let qualifies = false

    // Check if activity meets condition
    if (criteria.condition === 'start_hour < 7') {
      const hour = new Date(activity.start_date_local).getHours()
      qualifies = hour < 7
    } else if (criteria.condition === 'start_hour >= 21') {
      const hour = new Date(activity.start_date_local).getHours()
      qualifies = hour >= 21
    }

    if (qualifies) {
      progress.current_value += 1

      // Check tier achievements
      const tierAchieved = this.checkTierProgress(
        progress.current_value,
        criteria,
        progress
      )

      if (tierAchieved) {
        await this.awardBadge(badge, activity.user_id, tierAchieved, progress.current_value)
      }

      // Update progress
      await this.supabase
        .from('badge_progress')
        .upsert({
          ...progress,
          last_activity_id: activity.strava_activity_id,
          last_updated: new Date().toISOString()
        })
    }
  }

  private async handleCumulativeBadge(badge: Badge, activity: Activity, progress: BadgeProgress) {
    const { criteria } = badge
    let increment = 0

    // Check activity type filter
    if (criteria.activity_type && activity.type !== criteria.activity_type) {
      return
    }

    // Calculate increment based on metric
    switch (criteria.metric) {
      case 'distance_km':
        increment = (activity.distance || 0) / 1000
        break
      case 'elevation_gain':
        increment = activity.total_elevation_gain || 0
        break
    }

    progress.current_value += increment

    const tierAchieved = this.checkTierProgress(
      progress.current_value,
      criteria,
      progress
    )

    if (tierAchieved) {
      await this.awardBadge(badge, activity.user_id, tierAchieved, progress.current_value)
    }

    await this.supabase
      .from('badge_progress')
      .upsert({
        ...progress,
        last_activity_id: activity.strava_activity_id,
        last_updated: new Date().toISOString()
      })
  }

  private async handleSingleActivityBadge(badge: Badge, activity: Activity, progress: BadgeProgress) {
    const { criteria } = badge
    let value = 0

    // Check activity type filter
    if (criteria.activity_type && activity.type !== criteria.activity_type) {
      return
    }

    switch (criteria.metric) {
      case 'calories_per_hour':
        const hours = activity.moving_time / 3600
        value = hours > 0 ? (activity.calories || 0) / hours : 0
        break
      case 'average_speed_kmh':
        value = (activity.average_speed || 0) * 3.6 // Convert m/s to km/h
        break
    }

    // Check if this activity achieves any tier
    let tierAchieved = null
    if (!progress.gold_achieved && value >= criteria.gold) {
      tierAchieved = 'gold'
    } else if (!progress.silver_achieved && value >= criteria.silver) {
      tierAchieved = 'silver'
    } else if (!progress.bronze_achieved && value >= criteria.bronze) {
      tierAchieved = 'bronze'
    }

    if (tierAchieved) {
      await this.awardBadge(badge, activity.user_id, tierAchieved, value)

      // Update progress flags
      if (tierAchieved === 'bronze') progress.bronze_achieved = true;
      if (tierAchieved === 'silver') progress.silver_achieved = true;
      if (tierAchieved === 'gold') progress.gold_achieved = true;

      await this.supabase
        .from('badge_progress')
        .upsert({
          ...progress,
          current_value: Math.max(progress.current_value, value),
          last_activity_id: activity.strava_activity_id,
          last_updated: new Date().toISOString()
        })
    }
  }

  private async handleWeeklyStreakBadge(badge: Badge, activity: Activity, progress: BadgeProgress) {
    // Get all weeks with activities for this user
    const { data: weeklyActivity } = await this.supabase
      .from('user_points')
      .select('week_start')
      .eq('user_id', activity.user_id)
      .gt('total_hours', 0)
      .order('week_start', { ascending: false })

    if (!weeklyActivity) return

    // Calculate consecutive weeks
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

    const tierAchieved = this.checkTierProgress(
      streak,
      badge.criteria,
      progress
    )

    if (tierAchieved) {
      await this.awardBadge(badge, activity.user_id, tierAchieved, streak)
    }

    await this.supabase
      .from('badge_progress')
      .upsert({
        ...progress,
        last_activity_id: activity.strava_activity_id,
        last_updated: new Date().toISOString()
      })
  }

  private async handleVarietyBadge(badge: Badge, activity: Activity, progress: BadgeProgress) {
    // Get unique sport types for this user
    const { data: uniqueSports } = await this.supabase
      .from('strava_activities')
      .select('sport_type')
      .eq('user_id', activity.user_id)
      .is('deleted_at', null)

    if (!uniqueSports) return

    const uniqueTypes = new Set(uniqueSports.map(s => s.sport_type))
    const count = uniqueTypes.size

    progress.current_value = count

    const tierAchieved = this.checkTierProgress(
      count,
      badge.criteria,
      progress
    )

    if (tierAchieved) {
      await this.awardBadge(badge, activity.user_id, tierAchieved, count)
    }

    await this.supabase
      .from('badge_progress')
      .upsert({
        ...progress,
        metadata: { sports: Array.from(uniqueTypes) },
        last_activity_id: activity.strava_activity_id,
        last_updated: new Date().toISOString()
      })
  }

  private checkTierProgress(value: number, criteria: BadgeCriteria, progress: BadgeProgress): string | null {
    if (!progress.gold_achieved && value >= criteria.gold) {
      return 'gold'
    } else if (!progress.silver_achieved && value >= criteria.silver) {
      return 'silver'
    } else if (!progress.bronze_achieved && value >= criteria.bronze) {
      return 'bronze'
    }
    return null
  }

  private async awardBadge(badge: Badge, userId: string, tier: string, value: number) {
    // Badge tier point values
    const tierPoints: { [key: string]: number } = { bronze: 3, silver: 6, gold: 10 }
    
    // Check if already awarded
    const { data: existing } = await this.supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .single()

    let pointsToAward = 0

    if (existing) {
      // Update to higher tier if achieved
      const tierOrder: { [key: string]: number } = { bronze: 1, silver: 2, gold: 3 }
      if (tierOrder[tier] > tierOrder[existing.tier]) {
        // Calculate point difference for tier upgrade
        const previousPoints = existing.points_awarded || tierPoints[existing.tier] || 0
        pointsToAward = tierPoints[tier] - previousPoints
        
        await this.supabase
          .from('user_badges')
          .update({
            tier,
            progress_value: value,
            points_awarded: tierPoints[tier],
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          
        console.log(`Badge upgraded: ${badge.name} from ${existing.tier} to ${tier} for user ${userId} (+${pointsToAward} points)`)
      }
    } else {
      // Award new badge
      pointsToAward = tierPoints[tier]
      
      await this.supabase
        .from('user_badges')
        .insert({
          user_id: userId,
          badge_id: badge.id,
          tier,
          progress_value: value,
          points_awarded: tierPoints[tier]
        })
        
      console.log(`Badge awarded: ${badge.name} ${tier} for user ${userId} (+${pointsToAward} points)`)
    }
    
    // Update cumulative points if badge was awarded or upgraded
    if (pointsToAward > 0) {
      // Get current cumulative points
      const { data: profile } = await this.supabase
        .from('user_profiles')
        .select('cumulative_points')
        .eq('id', userId)
        .single()
      
      const currentCumulative = profile?.cumulative_points || 0
      const newCumulative = currentCumulative + pointsToAward
      
      // Update cumulative points
      await this.supabase
        .from('user_profiles')
        .upsert({
          id: userId,
          cumulative_points: newCumulative,
          updated_at: new Date().toISOString()
        })
      
      console.log(`Updated cumulative points for user ${userId}: ${currentCumulative.toFixed(2)} -> ${newCumulative.toFixed(2)} (+${pointsToAward})`)
    }
  }
}