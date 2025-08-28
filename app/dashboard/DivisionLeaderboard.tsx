'use client'

import { useState, useEffect } from 'react'
import AthleteCard from './AthleteCard'

interface DivisionLeaderboardProps {
  userId: string
}

interface LeaderboardEntry {
  user_id: string
  strava_firstname: string
  strava_lastname: string
  position: number
  points: number
  total_hours: number
  zone: 'promotion' | 'safe' | 'relegation'
}

export default function DivisionLeaderboard({ userId }: DivisionLeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('/api/divisions')
        if (!response.ok) {
          throw new Error('Failed to fetch division standings')
        }
        const data = await response.json()
        setLeaderboard(data.standings || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-6 animate-pulse">
            <div className="h-20 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}></div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  if (!leaderboard.length) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-gray-400">No athletes in this division yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {leaderboard.map((athlete) => (
        <AthleteCard
          key={athlete.user_id}
          rank={athlete.position}
          name={`${athlete.strava_firstname} ${athlete.strava_lastname}`.trim()}
          points={athlete.points}
          hours={athlete.total_hours}
          zone={athlete.zone}
          isCurrentUser={athlete.user_id === userId}
        />
      ))}
    </div>
  )
}