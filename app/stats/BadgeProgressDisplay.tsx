'use client'

import { useEffect, useState } from 'react'

interface BadgeCriteria {
  type: string
  condition?: string
  bronze: number
  silver: number
  gold: number
  metric?: string
  activity_type?: string
  reset_period?: string
}

interface Badge {
  id: string
  code: string
  name: string
  emoji: string
  category: string
  criteria: BadgeCriteria
}

interface BadgeProgress {
  badge: Badge
  current_value: number
  earned_tier: 'bronze' | 'silver' | 'gold' | null
  next_tier: 'bronze' | 'silver' | 'gold' | null
  next_tier_target: number | null
  percentage: number
  unit: string
  is_periodic: boolean
  period_label: string | null
}

export default function BadgeProgressDisplay() {
  const [progress, setProgress] = useState<BadgeProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProgress()
  }, [])

  const fetchProgress = async () => {
    try {
      const response = await fetch('/api/badges/progress')
      if (!response.ok) {
        throw new Error('Failed to fetch badge progress')
      }
      const data = await response.json()
      setProgress(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-8">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-700 rounded w-full mb-2"></div>
          <div className="h-8 bg-gray-700 rounded w-full mb-2"></div>
          <div className="h-8 bg-gray-700 rounded w-full"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card p-8">
        <p className="text-red-400">Error loading badge progress: {error}</p>
      </div>
    )
  }

  // Group badges by category
  const groupedBadges = progress.reduce((acc, item) => {
    const category = item.badge.category || 'other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(item)
    return acc
  }, {} as Record<string, BadgeProgress[]>)

  const categoryOrder = ['time', 'distance', 'intensity', 'streak', 'activity', 'elevation', 'speed', 'variety', 'other']
  const sortedCategories = Object.keys(groupedBadges).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a)
    const bIndex = categoryOrder.indexOf(b)
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  return (
    <div className="space-y-8">
      {sortedCategories.map(category => (
        <div key={category} className="glass-card p-6">
          <h2 className="text-2xl font-bold text-white mb-6 capitalize">
            {category} Badges
          </h2>
          <div className="space-y-4">
            {groupedBadges[category].map(item => (
              <BadgeProgressItem key={item.badge.id} progress={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function BadgeProgressItem({ progress }: { progress: BadgeProgress }) {
  const { badge, current_value, earned_tier, next_tier, next_tier_target, percentage, unit, is_periodic, period_label } = progress
  
  // Format display value
  const formatValue = (value: number) => {
    if (unit === 'km' || unit === 'm') {
      return value.toFixed(1)
    }
    return Math.floor(value).toString()
  }

  // Get tier colors
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'bronze': return 'text-orange-600'
      case 'silver': return 'text-gray-400'
      case 'gold': return 'text-yellow-500'
      default: return 'text-gray-600'
    }
  }

  // Get progress bar color
  const getProgressColor = () => {
    if (percentage >= 100) return 'bg-gradient-to-r from-yellow-500 to-yellow-600'
    if (percentage >= 75) return 'bg-gradient-to-r from-green-500 to-green-600'
    if (percentage >= 50) return 'bg-gradient-to-r from-blue-500 to-blue-600'
    if (percentage >= 25) return 'bg-gradient-to-r from-purple-500 to-purple-600'
    return 'bg-gradient-to-r from-gray-500 to-gray-600'
  }

  return (
    <div className="border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{badge.emoji}</span>
          <div>
            <h3 className="text-lg font-semibold text-white">
              {badge.name}
              {is_periodic && period_label && (
                <span className="ml-2 text-sm text-blue-400 font-normal">
                  ({period_label})
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {earned_tier && (
                <span className={`text-sm font-medium ${getTierColor(earned_tier)}`}>
                  {earned_tier.charAt(0).toUpperCase() + earned_tier.slice(1)} ✓
                </span>
              )}
              {next_tier && (
                <span className="text-sm text-gray-400">
                  Next: {next_tier.charAt(0).toUpperCase() + next_tier.slice(1)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-medium">
            {formatValue(current_value)} / {next_tier_target ? formatValue(next_tier_target) : '∞'} {unit}
          </div>
          <div className="text-sm text-gray-400">
            {percentage.toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${getProgressColor()}`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
        
        {/* Tier markers */}
        <div className="absolute inset-0 flex items-center">
          {/* Bronze marker */}
          {!earned_tier && (
            <div
              className="absolute w-px h-5 bg-orange-600 -top-1"
              style={{ left: '100%' }}
              title="Bronze"
            />
          )}
          {/* Silver marker (if working towards it) */}
          {earned_tier === 'bronze' && next_tier === 'silver' && (
            <div
              className="absolute w-px h-5 bg-gray-400 -top-1"
              style={{ left: '100%' }}
              title="Silver"
            />
          )}
          {/* Gold marker (if working towards it) */}
          {earned_tier === 'silver' && next_tier === 'gold' && (
            <div
              className="absolute w-px h-5 bg-yellow-500 -top-1"
              style={{ left: '100%' }}
              title="Gold"
            />
          )}
        </div>
      </div>

      {/* Criteria description */}
      <div className="mt-3 text-xs text-gray-500">
        {getCriteriaDescription(badge.criteria)}
      </div>
    </div>
  )
}

function getCriteriaDescription(criteria: BadgeCriteria): string {
  const { type, condition, bronze, silver, gold, metric, activity_type, reset_period } = criteria
  
  let base = ''
  
  if (type === 'count' && condition?.includes('hour < 7')) {
    base = `Start activities before 7 AM`
  } else if (type === 'count' && condition?.includes('hour >= 21')) {
    base = `Start activities after 9 PM`
  } else if (type === 'cumulative' && metric === 'distance_km') {
    base = activity_type ? `${activity_type} distance` : 'Total distance'
  } else if (type === 'cumulative' && metric === 'elevation_gain') {
    base = 'Total elevation gain'
  } else if (type === 'single_activity' && metric === 'calories_per_hour') {
    base = 'Burn calories per hour in a single activity'
  } else if (type === 'single_activity' && metric === 'average_speed_kmh') {
    base = 'Average speed in a single ride'
  } else if (type === 'weekly_streak') {
    base = 'Consecutive weeks with activities'
  } else if (type === 'unique_sports') {
    base = 'Try different sport types'
  }
  
  const targets = `Bronze: ${bronze}, Silver: ${silver}, Gold: ${gold}`
  const period = reset_period === 'weekly' ? ' (resets weekly)' : ''
  
  return `${base}. ${targets}${period}`
}