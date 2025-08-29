'use client'

import { useState, useEffect } from 'react'
import AthleteCard from './AthleteCard'

interface DivisionLeaderboardProps {
  userId: string | null
  divisionId?: string
}

interface LeaderboardEntry {
  user_id: string
  name: string
  strava_profile?: string
  total_points: number
  total_hours: number
}

interface DivisionData {
  division: {
    id: string
    name: string
    level: number
  }
  position: number
  totalInDivision: number
  zone: 'promotion' | 'safe' | 'relegation'
  leaderboard: LeaderboardEntry[]
}

export default function DivisionLeaderboard({ userId, divisionId }: DivisionLeaderboardProps) {
  const [data, setData] = useState<DivisionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const url = divisionId ? `/api/divisions?divisionId=${divisionId}` : '/api/divisions'
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error('Failed to fetch division standings')
        }
        const divisionData = await response.json()
        setData(divisionData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [divisionId])

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

  if (!data || !data.leaderboard.length) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-gray-400">No athletes in this division yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.leaderboard.map((athlete, index) => (
        <AthleteCard
          key={athlete.user_id}
          rank={index + 1}
          name={athlete.name}
          points={athlete.total_points}
          hours={athlete.total_hours}
          zone={data.zone}
          isCurrentUser={athlete.user_id === userId}
          badges={[]}
        />
      ))}
    </div>
  )
}