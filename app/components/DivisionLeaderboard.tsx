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
  badges?: Array<{
    emoji: string
    name: string
    tier: string
  }>
}

interface DivisionData {
  division: {
    id: string
    name: string
    level: number
  }
  position: number
  totalInDivision: number
  zone: string
  leaderboard: LeaderboardEntry[]
  currentUser?: {
    id: string
    points: number
    hours: number
  }
}

export default function DivisionLeaderboard({ userId, divisionId }: DivisionLeaderboardProps) {
  const [data, setData] = useState<DivisionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDivisionData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId])

  async function fetchDivisionData() {
    try {
      const params = divisionId ? `?divisionId=${divisionId}` : ''
      const response = await fetch(`/api/divisions${params}`)
      const divisionData = await response.json()
      setData(divisionData)
    } catch (error) {
      console.error('Error fetching division data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-20 bg-white/10 rounded"></div>
          <div className="h-20 bg-white/10 rounded"></div>
          <div className="h-20 bg-white/10 rounded"></div>
        </div>
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

  // Function to determine zone based on rank and division level
  const getZone = (rank: number): 'promotion' | 'relegation' | null => {
    // Only top player in divisions 1-3 gets promotion zone
    if (rank === 1 && data.division.level < 4) {
      return 'promotion'
    }
    // Only last player in divisions 2-4 gets relegation zone
    if (rank === data.leaderboard.length && data.leaderboard.length > 1 && data.division.level > 1) {
      return 'relegation'
    }
    // No zone indicator for safe positions
    return null
  }

  return (
    <div className="space-y-4">
      {data.leaderboard.map((athlete, index) => {
        const rank = index + 1
        const zone = getZone(rank)
        
        return (
          <AthleteCard
            key={athlete.user_id}
            rank={rank}
            name={athlete.name}
            points={athlete.total_points}
            hours={athlete.total_hours}
            zone={zone}
            isCurrentUser={athlete.user_id === userId}
            badges={athlete.badges || []}
            profilePicture={athlete.strava_profile}
          />
        )
      })}
    </div>
  )
}