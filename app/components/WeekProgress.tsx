'use client'

import { useEffect, useState } from 'react'

export default function WeekProgress() {
  const [daysRemaining, setDaysRemaining] = useState(0)
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    const calculateProgress = () => {
      const now = new Date()
      const sunday = new Date()
      sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay() + 7)
      sunday.setUTCHours(23, 59, 59, 999)
      
      const msRemaining = sunday.getTime() - now.getTime()
      const days = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
      setDaysRemaining(days)
      
      // Calculate week progress (0-100%)
      const weekStart = new Date()
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay())
      weekStart.setUTCHours(0, 0, 0, 0)
      
      const weekDuration = 7 * 24 * 60 * 60 * 1000
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
        <span>Monday</span>
        <span>Sunday 11:59 PM UTC</span>
      </div>
    </div>
  )
}