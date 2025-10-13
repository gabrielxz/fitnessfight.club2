import { SupabaseClient } from '@supabase/supabase-js'
import polyline from '@mapbox/polyline'

interface Activity {
  id: string
  user_id: string
  strava_activity_id: number
  start_date_local: string
  elapsed_time: number
  map_summary_polyline?: string | null
}

interface Coordinates {
  lat: number
  lng: number
}

interface GroupedActivity {
  activity: Activity
  coordinates: Coordinates
  timestamp: Date
}

export class PackAnimalDetector {
  private readonly TIME_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
  private readonly DISTANCE_THRESHOLD_M = 150 // 150 meters
  private readonly MIN_ELAPSED_TIME_S = 15 * 60 // 15 minutes

  constructor(private supabase: SupabaseClient) {}

  /**
   * Detect group activities and award Pack Animal badges
   * @param lookbackHours How many hours to look back (default 24)
   * @param dryRun If true, only log what would be awarded without making changes
   */
  async detectAndAwardBadges(lookbackHours = 24, dryRun = false): Promise<void> {
    console.log(`[PackAnimalDetector] Starting detection (lookback: ${lookbackHours}h, dryRun: ${dryRun})`)

    // Calculate cutoff time
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - lookbackHours)
    const cutoffISO = cutoffTime.toISOString()

    // Fetch activities with GPS data from the last X hours
    const { data: activities, error } = await this.supabase
      .from('strava_activities')
      .select('id, user_id, strava_activity_id, start_date_local, elapsed_time, map_summary_polyline')
      .gte('start_date_local', cutoffISO)
      .gte('elapsed_time', this.MIN_ELAPSED_TIME_S)
      .is('deleted_at', null)
      .order('start_date_local', { ascending: true })

    if (error) {
      console.error('[PackAnimalDetector] Error fetching activities:', error)
      return
    }

    if (!activities || activities.length === 0) {
      console.log('[PackAnimalDetector] No qualifying activities found')
      return
    }

    console.log(`[PackAnimalDetector] Found ${activities.length} activities to analyze`)

    // Extract coordinates and filter out activities without GPS data
    const activitiesWithGPS: GroupedActivity[] = []

    for (const activity of activities) {
      const coords = this.extractCoordinates(activity)
      if (coords) {
        activitiesWithGPS.push({
          activity,
          coordinates: coords,
          timestamp: new Date(activity.start_date_local)
        })
      }
    }

    console.log(`[PackAnimalDetector] ${activitiesWithGPS.length} activities have GPS data`)

    if (activitiesWithGPS.length < 2) {
      console.log('[PackAnimalDetector] Not enough GPS activities to form groups')
      return
    }

    // Group activities by proximity
    const groups = this.groupActivitiesByProximity(activitiesWithGPS)

    console.log(`[PackAnimalDetector] Detected ${groups.length} groups`)

    // Award badges for each group
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      const userCount = group.length

      if (userCount < 2) continue // Need at least 2 users for Pack Animal

      console.log(`\n[PackAnimalDetector] Group ${i + 1}: ${userCount} users`)
      console.log(`  Users: ${group.map(g => g.activity.user_id.substring(0, 8)).join(', ')}`)
      console.log(`  Activities: ${group.map(g => g.activity.strava_activity_id).join(', ')}`)

      // Determine tier based on user count
      let tier: 'bronze' | 'silver' | 'gold' | null = null
      if (userCount >= 6) tier = 'gold'
      else if (userCount >= 3) tier = 'silver'
      else if (userCount >= 2) tier = 'bronze'

      if (!tier) continue

      console.log(`  Tier: ${tier}`)

      // Award badge to each user in the group
      for (const groupedActivity of group) {
        const userId = groupedActivity.activity.user_id

        if (dryRun) {
          console.log(`  [DRY RUN] Would award ${tier} Pack Animal to user ${userId.substring(0, 8)}`)
        } else {
          await this.awardPackAnimalBadge(userId, tier, userCount)
        }
      }
    }

    console.log(`\n[PackAnimalDetector] Detection complete`)
  }

  /**
   * Extract starting coordinates from an activity
   */
  private extractCoordinates(activity: Activity): Coordinates | null {
    // Decode polyline to get coordinates
    if (activity.map_summary_polyline) {
      try {
        const decoded = polyline.decode(activity.map_summary_polyline)
        if (decoded && decoded.length > 0) {
          return {
            lat: decoded[0][0],
            lng: decoded[0][1]
          }
        }
      } catch (error) {
        console.error(`[PackAnimalDetector] Error decoding polyline for activity ${activity.strava_activity_id}:`, error)
      }
    }

    return null
  }

  /**
   * Group activities that started at similar times and locations
   */
  private groupActivitiesByProximity(activities: GroupedActivity[]): GroupedActivity[][] {
    const groups: GroupedActivity[][] = []
    const assigned = new Set<string>()

    for (let i = 0; i < activities.length; i++) {
      const activityA = activities[i]

      // Skip if already assigned to a group
      if (assigned.has(activityA.activity.id)) continue

      // Start a new group
      const group: GroupedActivity[] = [activityA]
      assigned.add(activityA.activity.id)

      // Find all activities that match this one
      for (let j = i + 1; j < activities.length; j++) {
        const activityB = activities[j]

        // Skip if already assigned
        if (assigned.has(activityB.activity.id)) continue

        // Skip if same user (can't group with yourself)
        if (activityA.activity.user_id === activityB.activity.user_id) continue

        // Check if this activity is close to ANY activity in the current group
        let matchesGroup = false
        for (const groupMember of group) {
          if (this.activitiesMatch(groupMember, activityB)) {
            matchesGroup = true
            break
          }
        }

        if (matchesGroup) {
          group.push(activityB)
          assigned.add(activityB.activity.id)
        }
      }

      groups.push(group)
    }

    // Filter out solo activities (groups of 1)
    return groups.filter(g => g.length >= 2)
  }

  /**
   * Check if two activities match based on time and distance
   */
  private activitiesMatch(a: GroupedActivity, b: GroupedActivity): boolean {
    // Check time difference
    const timeDiffMs = Math.abs(a.timestamp.getTime() - b.timestamp.getTime())
    if (timeDiffMs > this.TIME_THRESHOLD_MS) return false

    // Check distance
    const distanceM = this.haversineDistance(
      a.coordinates.lat, a.coordinates.lng,
      b.coordinates.lat, b.coordinates.lng
    )

    return distanceM <= this.DISTANCE_THRESHOLD_M
  }

  /**
   * Calculate Haversine distance between two coordinates in meters
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
  }

  /**
   * Award Pack Animal badge to a user
   */
  private async awardPackAnimalBadge(userId: string, tier: 'bronze' | 'silver' | 'gold', groupSize: number): Promise<void> {
    try {
      // Get Pack Animal badge ID
      const { data: badge, error: badgeError } = await this.supabase
        .from('badges')
        .select('id, code')
        .eq('code', 'pack_animal')
        .single()

      if (badgeError || !badge) {
        console.error('[PackAnimalDetector] Pack Animal badge not found in database')
        return
      }

      // Check if user already has this badge
      const { data: existing, error: existingError } = await this.supabase
        .from('user_badges')
        .select('*')
        .eq('user_id', userId)
        .eq('badge_id', badge.id)
        .single()

      const tierPoints: { [key: string]: number } = { bronze: 3, silver: 6, gold: 15 }
      const tierOrder: { [key: string]: number } = { bronze: 1, silver: 2, gold: 3 }

      let pointsToAward = 0

      if (existing) {
        // Check if this is an upgrade
        if (tierOrder[tier] > tierOrder[existing.tier]) {
          const previousPoints = existing.points_awarded || 0
          pointsToAward = tierPoints[tier] - previousPoints

          await this.supabase
            .from('user_badges')
            .update({
              tier,
              progress_value: groupSize,
              points_awarded: tierPoints[tier],
              earned_at: new Date().toISOString()
            })
            .eq('id', existing.id)

          console.log(`  ✓ Upgraded user ${userId.substring(0, 8)} from ${existing.tier} to ${tier} (+${pointsToAward} pts)`)
        } else {
          console.log(`  → User ${userId.substring(0, 8)} already has ${existing.tier} or better`)
        }
      } else {
        // New badge
        pointsToAward = tierPoints[tier]

        await this.supabase
          .from('user_badges')
          .insert({
            user_id: userId,
            badge_id: badge.id,
            tier,
            progress_value: groupSize,
            points_awarded: tierPoints[tier]
          })

        console.log(`  ✓ Awarded ${tier} Pack Animal to user ${userId.substring(0, 8)} (+${pointsToAward} pts)`)
      }

      // Award points to cumulative score
      if (pointsToAward > 0) {
        const { error: rpcError } = await this.supabase.rpc('increment_badge_points', {
          p_user_id: userId,
          p_points_to_add: pointsToAward
        })

        if (rpcError) {
          console.error(`[PackAnimalDetector] Error incrementing badge points for user ${userId}:`, rpcError)
        }
      }
    } catch (error) {
      console.error(`[PackAnimalDetector] Error awarding badge to user ${userId}:`, error)
    }
  }
}
