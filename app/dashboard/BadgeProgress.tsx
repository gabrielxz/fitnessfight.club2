'use client'

import { useEffect, useState } from 'react'

interface BadgeCriteria {
  type: string;
  condition?: string;
  bronze: number;
  silver: number;
  gold: number;
  metric?: string;
  activity_type?: string;
}

interface BadgeProgressData {
  badge: {
    name: string
    emoji: string
    criteria: BadgeCriteria
  }
  current_value: number
  next_tier: string | null
  next_tier_target: number | null
  percentage: number
}

export default function BadgeProgress({ userId }: { userId: string }) {
  const [progress, setProgress] = useState<BadgeProgressData[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetchBadgeProgress()
  }, [userId])
  
  async function fetchBadgeProgress() {
    try {
      const response = await fetch('/api/badges/progress')
      const data = await response.json()
      setProgress(data)
    } finally {
      setLoading(false)
    }
  }
  
  if (loading) return <div>Loading badge progress...</div>
  
  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-bold mb-4">Badge Progress</h3>
      <div className="space-y-4">
        {progress.map((item, idx) => (
          <div key={idx} className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{item.badge.emoji}</span>
                <span className="font-medium">{item.badge.name}</span>
              </div>
              {item.next_tier && (
                <span className="text-sm text-gray-400">
                  Next: {item.next_tier} ({item.next_tier_target})
                </span>
              )}
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all"
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {item.current_value} / {item.next_tier_target || 'Max'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}