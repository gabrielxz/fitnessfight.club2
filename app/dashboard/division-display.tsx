'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface DivisionDisplayProps {
  userId: string
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
  leaderboard: Array<{
    user_id: string
    name: string
    strava_profile?: string
    total_points: number
    total_hours: number
  }>
  currentUser: {
    id: string
    points: number
    hours: number
  }
}

export default function DivisionDisplay({ userId }: DivisionDisplayProps) {
  const [divisionData, setDivisionData] = useState<DivisionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    fetchDivisionData()
  }, [])
  
  async function fetchDivisionData() {
    try {
      const response = await fetch('/api/divisions')
      if (!response.ok) {
        throw new Error('Failed to fetch division data')
      }
      const data = await response.json()
      setDivisionData(data)
    } catch (err) {
      console.error('Error fetching division data:', err)
      setError('Failed to load division data')
    } finally {
      setLoading(false)
    }
  }
  
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-3">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }
  
  if (error || !divisionData) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="text-red-600">
          {error || 'No division data available'}
        </div>
      </div>
    )
  }
  
  const { division, position, totalInDivision, zone, leaderboard, currentUser } = divisionData
  
  // Division emoji map
  const divisionEmojis: Record<string, string> = {
    'Noodle': '🍜',
    'Sweaty': '💦',
    'Shreddy': '💪',
    'Juicy': '🧃'
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{divisionEmojis[division.name] || '🏆'}</span>
            <h2 className="text-2xl font-bold text-gray-900">
              {division.name} Division
            </h2>
          </div>
          <p className="text-gray-600">
            Your position: <span className="font-semibold">#{position}</span> of {totalInDivision}
            {division.level < 4 && position === 1 && (
              <span className="text-green-600 ml-2">• Top 1 promotes to next division</span>
            )}
            {division.level > 1 && position === totalInDivision && totalInDivision > 1 && (
              <span className="text-red-600 ml-2">• Bottom 1 drops to lower division</span>
            )}
          </p>
        </div>
        {zone === 'promotion' && (
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
            ↑ Promotion Zone
          </span>
        )}
        {zone === 'relegation' && (
          <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
            ↓ Relegation Zone
          </span>
        )}
        {zone === 'safe' && (
          <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-semibold">
            Safe Zone
          </span>
        )}
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium text-gray-700">Your Stats This Week</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-900">
              {currentUser.points.toFixed(1)}
            </div>
            <div className="text-sm text-blue-700">Points (max 10/week)</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-2xl font-bold text-purple-900">
              {currentUser.hours.toFixed(1)}h
            </div>
            <div className="text-sm text-purple-700">Hours exercised</div>
          </div>
        </div>
      </div>
      
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Division Standings</h3>
        <div className="space-y-2">
          {leaderboard.map((user, idx) => {
            const isCurrentUser = user.user_id === userId
            const isPromotionZone = idx === 0 && division.level < 4
            const isRelegationZone = idx === leaderboard.length - 1 && leaderboard.length > 1 && division.level > 1
            
            return (
              <div 
                key={user.user_id} 
                className={`flex justify-between items-center p-3 rounded-lg transition-colors ${
                  isCurrentUser 
                    ? 'bg-blue-50 border-2 border-blue-200' 
                    : isPromotionZone
                    ? 'bg-green-50 border border-green-200'
                    : isRelegationZone
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${
                    idx === 0 ? 'text-yellow-600 text-lg' :
                    idx === 1 ? 'text-gray-500 text-lg' :
                    idx === 2 ? 'text-orange-600 text-lg' :
                    'text-gray-400'
                  }`}>
                    #{idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {user.strava_profile ? (
                      <Image 
                        src={user.strava_profile} 
                        alt={user.name}
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-sm font-semibold">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                    )}
                    <span className={`font-medium ${isCurrentUser ? 'text-blue-900' : 'text-gray-900'}`}>
                      {isCurrentUser ? 'You' : user.name}
                    </span>
                  </div>
                </div>
                <div className="flex gap-6 text-sm">
                  <div className="text-right">
                    <span className="font-bold text-lg text-gray-900">{user.total_points.toFixed(1)}</span>
                    <span className="text-gray-500 ml-1">pts</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-600">{user.total_hours.toFixed(1)}h</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t text-sm text-gray-500 text-center">
        Divisions update every Sunday at 11:59 PM UTC
      </div>
    </div>
  )
}