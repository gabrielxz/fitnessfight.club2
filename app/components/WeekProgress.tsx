'use client'

import { useEffect, useState } from 'react'

export default function WeekProgress() {
  const [daysRemaining, setDaysRemaining] = useState(0)
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    const calculateProgress = () => {
      const now = new Date()

      // Calculate end of competition period (Monday 10:00:00 UTC)
      const currentDay = now.getUTCDay()
      const daysUntilMonday = currentDay === 1 ? 7 : (8 - currentDay) % 7
      const monday = new Date(now)
      monday.setUTCDate(monday.getUTCDate() + daysUntilMonday)
      monday.setUTCHours(10, 0, 0, 0)

      // If we're past Monday 10:00 UTC, move to next week's Monday
      if (monday.getTime() <= now.getTime()) {
        monday.setUTCDate(monday.getUTCDate() + 7)
      }

      const msRemaining = monday.getTime() - now.getTime()
      const days = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
      setDaysRemaining(Math.min(days, 8)) // Can be up to 8 days if early Monday

      // Calculate week progress (0-100%) - Monday 10:00 UTC is both start and end
      const weekStart = new Date(now)
      const day = weekStart.getUTCDay()
      const adjustedDay = day === 0 ? 7 : day // Sunday is 7, not 0
      const diff = weekStart.getUTCDate() - (adjustedDay - 1) // Days back to Monday
      weekStart.setUTCDate(diff)
      weekStart.setUTCHours(10, 0, 0, 0)

      // If we're before Monday 10:00 UTC, use previous Monday
      if (weekStart.getTime() > now.getTime()) {
        weekStart.setUTCDate(weekStart.getUTCDate() - 7)
      }

      const weekDuration = 7 * 24 * 60 * 60 * 1000 // Exactly 7 days
      const elapsed = now.getTime() - weekStart.getTime()
      setProgress(Math.min((elapsed / weekDuration) * 100, 100))
    }
    
    calculateProgress()
    const interval = setInterval(calculateProgress, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div className="glass-card p-6 mt-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Division Competition Progress</h3>
        <span className="text-gray-400 text-sm">
          {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
        <div 
          className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>Monday 10:00 AM UTC</span>
        <span>Monday 10:00 AM UTC</span>
      </div>
    </div>
  )
}