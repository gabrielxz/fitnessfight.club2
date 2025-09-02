'use client'

import { useState, useEffect } from 'react'

// Common timezones grouped by region
const TIMEZONE_OPTIONS = {
  'Americas': [
    { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
    { value: 'America/Denver', label: 'Mountain Time (Denver)' },
    { value: 'America/Chicago', label: 'Central Time (Chicago)' },
    { value: 'America/New_York', label: 'Eastern Time (New York)' },
    { value: 'America/Sao_Paulo', label: 'Brasília Time (São Paulo)' },
    { value: 'America/Buenos_Aires', label: 'Argentina Time (Buenos Aires)' },
    { value: 'America/Mexico_City', label: 'Central Time (Mexico City)' },
    { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
  ],
  'Europe & Africa': [
    { value: 'Europe/London', label: 'GMT/BST (London)' },
    { value: 'Europe/Paris', label: 'Central European Time (Paris)' },
    { value: 'Europe/Berlin', label: 'Central European Time (Berlin)' },
    { value: 'Europe/Moscow', label: 'Moscow Time' },
    { value: 'Africa/Cairo', label: 'Eastern European Time (Cairo)' },
    { value: 'Africa/Johannesburg', label: 'South Africa Time' },
  ],
  'Asia & Pacific': [
    { value: 'Asia/Dubai', label: 'Gulf Standard Time (Dubai)' },
    { value: 'Asia/Kolkata', label: 'India Standard Time' },
    { value: 'Asia/Singapore', label: 'Singapore Time' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong Time' },
    { value: 'Asia/Shanghai', label: 'China Standard Time' },
    { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
    { value: 'Asia/Seoul', label: 'Korea Standard Time' },
    { value: 'Australia/Sydney', label: 'Sydney Time' },
    { value: 'Australia/Melbourne', label: 'Melbourne Time' },
    { value: 'Pacific/Auckland', label: 'New Zealand Time' },
  ],
  'UTC': [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  ]
}

export default function TimezoneSettings() {
  const [currentTimezone, setCurrentTimezone] = useState<string>('')
  const [selectedTimezone, setSelectedTimezone] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    // Detect browser timezone
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    
    // Fetch current user profile
    fetchProfile(detectedTimezone)
  }, [])

  const fetchProfile = async (detectedTimezone: string) => {
    try {
      const response = await fetch('/api/user/profile')
      if (response.ok) {
        const data = await response.json()
        const tz = data.timezone || detectedTimezone
        setCurrentTimezone(tz)
        setSelectedTimezone(tz)
      } else {
        // No profile yet, use detected timezone
        setCurrentTimezone(detectedTimezone)
        setSelectedTimezone(detectedTimezone)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      setCurrentTimezone(detectedTimezone)
      setSelectedTimezone(detectedTimezone)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: selectedTimezone })
      })

      if (response.ok) {
        setCurrentTimezone(selectedTimezone)
        setMessage({ type: 'success', text: 'Timezone updated successfully!' })
        
        // Clear message after 3 seconds
        setTimeout(() => setMessage(null), 3000)
      } else {
        throw new Error('Failed to update timezone')
      }
    } catch (error) {
      console.error('Error updating timezone:', error)
      setMessage({ type: 'error', text: 'Failed to update timezone. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const detectAndSet = () => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    setSelectedTimezone(detectedTimezone)
  }

  // Calculate when week ends in selected timezone
  const getWeekEndPreview = () => {
    if (!selectedTimezone) return null
    
    try {
      // Week ends at 23:59 UTC on Sunday
      const now = new Date()
      const currentDay = now.getUTCDay()
      const daysUntilSunday = currentDay === 0 ? 0 : 7 - currentDay
      
      // Create date for next Sunday 23:59 UTC
      const weekEndUTC = new Date(now)
      weekEndUTC.setUTCDate(weekEndUTC.getUTCDate() + daysUntilSunday)
      weekEndUTC.setUTCHours(23, 59, 59, 0)
      
      // Convert to selected timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: selectedTimezone,
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      
      return formatter.format(weekEndUTC)
    } catch {
      return null
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-white/10 rounded w-1/4 mb-4"></div>
          <div className="h-10 bg-white/10 rounded mb-2"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Timezone Settings</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Your Timezone
          </label>
          <select
            value={selectedTimezone}
            onChange={(e) => setSelectedTimezone(e.target.value)}
            className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {Object.entries(TIMEZONE_OPTIONS).map(([region, timezones]) => (
              <optgroup key={region} label={region}>
                {timezones.map(tz => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <button
          onClick={detectAndSet}
          className="text-sm text-orange-400 hover:text-orange-300 transition-colors"
        >
          🔍 Auto-detect my timezone
        </button>

        {selectedTimezone && (
          <div className="p-3 bg-white/5 rounded-lg">
            <p className="text-sm text-gray-300">
              <span className="font-medium">Week ends at:</span> {getWeekEndPreview()}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Complete your Sunday habits before this time
            </p>
          </div>
        )}

        {message && (
          <div className={`p-3 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-500/10 border border-green-500/30 text-green-400' 
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || selectedTimezone === currentTimezone}
            className="px-6 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-lg font-semibold hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {saving ? 'Saving...' : 'Save Timezone'}
          </button>
          
          {selectedTimezone !== currentTimezone && (
            <button
              onClick={() => setSelectedTimezone(currentTimezone)}
              className="px-6 py-2 bg-white/10 text-white rounded-lg font-semibold hover:bg-white/20 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}