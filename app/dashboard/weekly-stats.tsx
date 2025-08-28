'use client'

import { useEffect, useState } from 'react'

interface WeeklyStatsProps {
  userId: string
}

interface Stats {
  currentWeekHours: number
  lastWeekHours: number
  currentWeekPoints: number
  lastWeekPoints: number
  activityCount: number
  totalDistance: number
}

export default function WeeklyStats({ userId }: WeeklyStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats/weekly')
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error('Failed to fetch weekly stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [userId])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const percentageChange = stats.lastWeekHours > 0 
    ? ((stats.currentWeekHours - stats.lastWeekHours) / stats.lastWeekHours * 100)
    : 0

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">This Week&apos;s Training</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-sm text-gray-600">Weekly Points</p>
          <p className="text-3xl font-bold text-blue-600">
            {stats.currentWeekPoints.toFixed(1)}
          </p>
          <p className="text-xs text-gray-500">Max 10 pts/week</p>
        </div>

        <div>
          <p className="text-sm text-gray-600">Weekly Hours</p>
          <p className="text-3xl font-bold text-gray-900">
            {stats.currentWeekHours.toFixed(1)}
          </p>
          {stats.lastWeekHours > 0 && (
            <p className={`text-sm ${percentageChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(0)}% vs last week
            </p>
          )}
        </div>

        <div>
          <p className="text-sm text-gray-600">Activities</p>
          <p className="text-3xl font-bold text-gray-900">
            {stats.activityCount}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-600">Distance</p>
          <p className="text-3xl font-bold text-gray-900">
            {stats.totalDistance.toFixed(0)} km
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Last week: {stats.lastWeekPoints.toFixed(1)} points • {stats.lastWeekHours.toFixed(1)} hours
          </span>
          <button 
            onClick={() => window.location.reload()}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}