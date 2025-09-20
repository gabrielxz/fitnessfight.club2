
import { SupabaseClient } from '@supabase/supabase-js'
import { getWeekBoundaries } from '@/lib/date-helpers'

interface Activity {
  strava_activity_id: number
  user_id: string
  start_date_local: string
  distance: number
  moving_time: number
  elapsed_time: number
  calories: number
  total_elevation_gain: number
  average_speed: number
  type: string
  sport_type: string
  athlete_count?: number
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
  activity_types?: string[];
  reset_period?: 'weekly' | 'monthly' | 'yearly';
  sports_list?: string[];
  min_elapsed_time?: number;
  min_habits?: number;
  min_activities?: number;
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

  async evaluateHabitBadgesForWeek(userId: string, weekStart: Date) {
    console.log(`[BadgeCalculator] Evaluating habit badges for user ${userId}, week ${weekStart.toISOString()}`)

    // Get habit badges
    const { data: badges, error: badgesError } = await this.supabase
      .from('badges')
      .select('*')
      .eq('active', true)
      .eq('criteria->type', 'habit_weeks')

    if (badgesError || !badges) {
      console.error('[BadgeCalculator] Error fetching habit badges:', badgesError)
      return
    }

    // Get user's timezone
    const { data: profile } = await this.supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', userId)
      .single()

    const timezone = profile?.timezone || 'UTC'

    // Check each habit badge
    for (const badge of badges) {
      await this.evaluateHabitBadge(badge, userId, weekStart, timezone)
    }
  }

  private async evaluateHabitBadge(badge: Badge, userId: string, weekStart: Date, timezone: string) {
    const { criteria } = badge

    // Get first 5 active habits for the user
    const { data: habits } = await this.supabase
      .from('habits')
      .select('id, target_frequency')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(5)

    if (!habits || habits.length < (criteria.min_habits || 5)) {
      return // User doesn't have enough habits
    }

    // Convert the UTC weekStart to the user's timezone week boundaries
    // The cron job passes a UTC Monday, but we need the user's local Monday
    const userWeekBoundaries = getWeekBoundaries(weekStart, timezone)
    const userWeekStartStr = userWeekBoundaries.weekStart.toISOString().split('T')[0]

    // Check if all first 5 habits achieved 100% for this week
    let allComplete = true

    for (const habit of habits.slice(0, 5)) {
      const { data: entries } = await this.supabase
        .from('habit_entries')
        .select('status')
        .eq('habit_id', habit.id)
        .eq('week_start', userWeekStartStr)
        .eq('status', 'SUCCESS')

      const successes = entries?.length || 0
      if (successes < habit.target_frequency) {
        allComplete = false
        break
      }
    }

    if (!allComplete) {
      return // Not all habits at 100%
    }

    // Week qualifies - update progress
    const { data: progress } = await this.supabase
      .from('badge_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('badge_id', badge.id)
      .is('period_start', null)
      .single()

    const currentProgress: BadgeProgress = progress || {
      user_id: userId,
      badge_id: badge.id,
      current_value: 0,
      bronze_achieved: false,
      silver_achieved: false,
      gold_achieved: false,
      metadata: { counted_weeks: [] }
    }

    // Check if this week has already been counted
    const metadata = currentProgress.metadata || {}
    const countedWeeks = metadata.counted_weeks || []

    if (!countedWeeks.includes(userWeekStartStr)) {
      countedWeeks.push(userWeekStartStr)
      currentProgress.current_value = countedWeeks.length
      currentProgress.metadata = { ...metadata, counted_weeks: countedWeeks }

      const tierAchieved = this.checkTierProgress(currentProgress.current_value, criteria, currentProgress)

      if (tierAchieved) {
        // Award badge but don't pass activity since this is habit-based
        await this.awardBadgeForHabits(badge, userId, tierAchieved, currentProgress.current_value)
      }

      await this.supabase.from('badge_progress').upsert({ ...currentProgress })
    }
  }

  private async awardBadgeForHabits(badge: Badge, userId: string, tier: string, value: number) {
    const tierPoints: { [key: string]: number } = { bronze: 3, silver: 6, gold: 15 }
    const { data: existing } = await this.supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
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
        .insert({ user_id: userId, badge_id: badge.id, tier, progress_value: value, points_awarded: tierPoints[tier] })
    }

    if (pointsToAward > 0) {
      // Award points to cumulative score
      const { error: rpcError } = await this.supabase.rpc('increment_badge_points', {
        p_user_id: userId,
        p_points_to_add: pointsToAward
      })

      if (rpcError) {
        console.error(`[BadgeCalculator] Error incrementing badge points for user ${userId}:`, rpcError)
      } else {
        console.log(`Awarded ${pointsToAward} cumulative badge points to user ${userId} for Rock Solid badge`)
      }
    }
  }

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
      case 'activity_weeks':
        await this.handleActivityWeeksBadge(badge, activity, currentProgress, timezone)
        break
    }
  }

  private async handleCountBadge(badge: Badge, activity: Activity, progress: BadgeProgress, _timezone: string) {
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

  private async handleCumulativeBadge(badge: Badge, activity: Activity, progress: BadgeProgress, _timezone: string) {
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

  private async handleSingleActivityBadge(badge: Badge, activity: Activity, progress: BadgeProgress, _timezone: string) {
    const { criteria } = badge
    let value = 0

    // Check minimum elapsed time requirement if specified
    if (criteria.min_elapsed_time && activity.elapsed_time < criteria.min_elapsed_time) {
      return
    }

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
      case 'athlete_count':
        value = activity.athlete_count || 1
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

  private async handleWeeklyStreakBadge(badge: Badge, activity: Activity, progress: BadgeProgress, _timezone: string) {
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

  private async handleVarietyBadge(badge: Badge, activity: Activity, progress: BadgeProgress, _timezone: string) {
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

  private async handleWeeklyCountBadge(badge: Badge, activity: Activity, progress: BadgeProgress, _timezone: string) {
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

  private async handleActivityWeeksBadge(badge: Badge, activity: Activity, progress: BadgeProgress, timezone: string) {
    const { criteria } = badge

    // Check if this activity is one of the required types
    const activityTypes = criteria.activity_types || []
    if (!activityTypes.includes(activity.type) && !activityTypes.includes(activity.sport_type)) {
      return // Activity doesn't match required types
    }

    // Get current week period
    const period = await this.getCurrentPeriod('weekly', activity.start_date_local, timezone)
    if (!period.start) return

    // Count qualifying activities for this week
    const { data: weekActivities } = await this.supabase
      .from('strava_activities')
      .select('id')
      .eq('user_id', activity.user_id)
      .gte('start_date_local', period.start)
      .lte('start_date_local', period.end + 'T23:59:59')
      .in('type', activityTypes)
      .is('deleted_at', null)

    const { data: weekActivitiesSportType } = await this.supabase
      .from('strava_activities')
      .select('id')
      .eq('user_id', activity.user_id)
      .gte('start_date_local', period.start)
      .lte('start_date_local', period.end + 'T23:59:59')
      .in('sport_type', activityTypes)
      .is('deleted_at', null)

    // Combine and deduplicate
    const allWeekActivities = new Set([
      ...(weekActivities || []).map(a => a.id),
      ...(weekActivitiesSportType || []).map(a => a.id)
    ])

    if (allWeekActivities.size >= (criteria.min_activities || 3)) {
      // Week qualifies - check if already counted
      const weekKey = period.start
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
