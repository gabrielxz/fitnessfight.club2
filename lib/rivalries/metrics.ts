/**
 * Shared rivalry metric computation.
 * Used by both the weekly close-out cron and the live rivalries display API.
 *
 * All returned scores are in display units matching rivalry_periods.metric_unit:
 *   distance metrics → km
 *   time metrics     → hours
 *   elevation        → meters
 *   counts           → integer count
 */

const RUN_WALK_TYPES = new Set(['Run', 'VirtualRun', 'TrailRun', 'Walk', 'Hike', 'Snowshoe'])
const STRENGTH_TYPES = new Set(['WeightTraining', 'Workout', 'Crossfit', 'HIIT', 'Pilates'])

export type MetricKey =
  | 'total_distance'
  | 'run_distance'
  | 'moving_time'
  | 'elevation_gain'
  | 'unique_activity_types'
  | 'strength_count'
  | 'active_days'
  | 'yoga_time'
  | 'dance_time'

export interface ActivityRow {
  user_id: string
  sport_type: string | null
  distance: number | null
  moving_time: number | null
  total_elevation_gain: number | null
  start_date: string // ISO timestamp string
}

/**
 * Returns a map of userId → score (in display units) for the given metric.
 * Users with no qualifying activities are absent from the map (score = 0 implied).
 */
export function computeMetricScores(
  activities: ActivityRow[],
  metric: MetricKey
): Record<string, number> {
  // Set-based metrics — need to accumulate unique values per user first
  if (metric === 'unique_activity_types' || metric === 'active_days') {
    const setsByUser: Record<string, Set<string>> = {}
    for (const act of activities) {
      if (!setsByUser[act.user_id]) setsByUser[act.user_id] = new Set()
      if (metric === 'unique_activity_types' && act.sport_type) {
        setsByUser[act.user_id].add(act.sport_type)
      } else if (metric === 'active_days') {
        setsByUser[act.user_id].add(act.start_date.slice(0, 10))
      }
    }
    const result: Record<string, number> = {}
    for (const [id, s] of Object.entries(setsByUser)) result[id] = s.size
    return result
  }

  // Numeric metrics — sum per user
  const scores: Record<string, number> = {}
  for (const act of activities) {
    let val = 0
    switch (metric) {
      case 'total_distance':
        val = (act.distance ?? 0) / 1000
        break
      case 'run_distance':
        if (act.sport_type && RUN_WALK_TYPES.has(act.sport_type))
          val = (act.distance ?? 0) / 1000
        break
      case 'moving_time':
        val = (act.moving_time ?? 0) / 3600
        break
      case 'elevation_gain':
        val = act.total_elevation_gain ?? 0
        break
      case 'strength_count':
        if (act.sport_type && STRENGTH_TYPES.has(act.sport_type)) val = 1
        break
      case 'yoga_time':
        if (act.sport_type === 'Yoga') val = (act.moving_time ?? 0) / 3600
        break
      case 'dance_time':
        if (act.sport_type === 'Dance') val = (act.moving_time ?? 0) / 3600
        break
    }
    if (val > 0) scores[act.user_id] = (scores[act.user_id] ?? 0) + val
  }
  return scores
}
