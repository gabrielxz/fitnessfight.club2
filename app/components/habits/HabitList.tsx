'use client'

import { useState, useEffect, useCallback } from 'react'
import HabitCard from './HabitCard'
import AddHabitDialog from './AddHabitDialog'

interface Habit {
  id: string
  name: string
  target_frequency: number
  position: number
  created_at: string
  updated_at: string
  archived_at: string | null
}

interface HabitEntry {
  id: string
  habit_id: string
  date: string
  status: 'SUCCESS' | 'FAILURE' | 'NEUTRAL'
  week_start: string
}

interface HabitSummary {
  successes: number
  target: number
  percentage: number
}

interface WeekData {
  weekStart: string
  weekEnd: string
  habits: Array<Habit & {
    entries: HabitEntry[]
    summary: HabitSummary
  }>
}

export default function HabitList() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [weeks, setWeeks] = useState<WeekData[]>([])
  const [currentDate, setCurrentDate] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0)
  const [totalWeeksLoaded, setTotalWeeksLoaded] = useState(1)
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set())

  // Get user's local date
  useEffect(() => {
    // Set current date in local timezone
    const localDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD format
    setCurrentDate(localDate)
  }, [])

  // Fetch habits and current week data
  const fetchHabits = useCallback(async (weeksToFetch = 1) => {
    try {
      const response = await fetch(`/api/habits?weeks=${weeksToFetch}`)
      if (!response.ok) throw new Error('Failed to fetch habits')
      
      const data = await response.json()
      setHabits(data.habits || [])
      setWeeks(data.weeks || [])
      setTotalWeeksLoaded(weeksToFetch)
    } catch (error) {
      console.error('Error fetching habits:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load more weeks (for scrolling history)
  const loadMoreWeeks = useCallback(async () => {
    if (loadingMore) return
    
    setLoadingMore(true)
    try {
      const response = await fetch(`/api/habits/history?weeks=4&offset=${totalWeeksLoaded}`)
      if (!response.ok) throw new Error('Failed to fetch history')
      
      const data = await response.json()
      if (data.weeks && data.weeks.length > 0) {
        setWeeks(prev => [...prev, ...data.weeks])
        setTotalWeeksLoaded(prev => prev + data.weeks.length)
      }
    } catch (error) {
      console.error('Error loading more weeks:', error)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, totalWeeksLoaded])

  // Initial load
  useEffect(() => {
    fetchHabits()
  }, [fetchHabits])

  // Handle habit creation
  const handleAddHabit = async (name: string, targetFrequency: number) => {
    try {
      const response = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, target_frequency: targetFrequency })
      })
      
      if (!response.ok) throw new Error('Failed to create habit')
      
      // Refresh habits
      await fetchHabits(totalWeeksLoaded)
      setShowAddDialog(false)
    } catch (error) {
      console.error('Error creating habit:', error)
    }
  }

  // Handle habit deletion
  const handleDeleteHabit = async (habitId: string) => {
    try {
      const response = await fetch(`/api/habits/${habitId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) throw new Error('Failed to delete habit')
      
      // Refresh habits
      await fetchHabits(totalWeeksLoaded)
    } catch (error) {
      console.error('Error deleting habit:', error)
    }
  }

  // Handle habit editing
  const handleEditHabit = async (habitId: string, name: string, targetFrequency: number) => {
    try {
      const response = await fetch(`/api/habits/${habitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, target_frequency: targetFrequency })
      })
      
      if (!response.ok) throw new Error('Failed to update habit')
      
      // Refresh habits
      await fetchHabits(totalWeeksLoaded)
    } catch (error) {
      console.error('Error updating habit:', error)
    }
  }

  // Handle status change
  const handleStatusChange = async (habitId: string, date: string, newStatus: 'SUCCESS' | 'FAILURE' | 'NEUTRAL') => {
    // Generate a unique key for this update
    const updateKey = `${habitId}-${date}`

    // Update local state immediately (optimistic update)
    setWeeks(prevWeeks => {
      return prevWeeks.map(week => {
        const updatedHabits = week.habits.map(habit => {
          if (habit.id === habitId) {
            // Update entries
            const existingEntryIndex = habit.entries.findIndex(e => e.date === date)
            const newEntries = [...habit.entries]

            if (newStatus === 'NEUTRAL') {
              // Remove entry if neutral
              if (existingEntryIndex >= 0) {
                newEntries.splice(existingEntryIndex, 1)
              }
            } else {
              // Add or update entry
              if (existingEntryIndex >= 0) {
                newEntries[existingEntryIndex] = { ...newEntries[existingEntryIndex], status: newStatus }
              } else {
                // Create a new entry
                newEntries.push({
                  id: `temp-${Date.now()}`, // Temporary ID
                  habit_id: habitId,
                  date: date,
                  status: newStatus,
                  week_start: week.weekStart
                })
              }
            }

            // Calculate new summary
            const successCount = newEntries.filter(e => e.status === 'SUCCESS').length
            const newSummary = {
              successes: successCount,
              target: habit.target_frequency,
              percentage: Math.round((successCount / habit.target_frequency) * 100)
            }

            return {
              ...habit,
              entries: newEntries,
              summary: newSummary
            }
          }
          return habit
        })

        return { ...week, habits: updatedHabits }
      })
    })

    // Mark this update as pending
    setPendingUpdates(prev => new Set(prev).add(updateKey))

    // Fire API call without awaiting (fire-and-forget)
    fetch(`/api/habits/${habitId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, status: newStatus })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      return response.json()
    })
    .then(data => {
      // Update with real entry ID from server if needed
      if (data.entry && newStatus !== 'NEUTRAL') {
        setWeeks(prevWeeks => {
          return prevWeeks.map(week => {
            const updatedHabits = week.habits.map(habit => {
              if (habit.id === habitId) {
                // Replace temporary entry with real one from server
                const entries = habit.entries.map(e =>
                  e.date === date && e.id.startsWith('temp-') ? data.entry : e
                )
                return {
                  ...habit,
                  entries
                }
              }
              return habit
            })
            return { ...week, habits: updatedHabits }
          })
        })
      }
    })
    .catch(error => {
      console.error('Error updating status:', error)
      // On error, revert the optimistic update by refetching
      fetchHabits(totalWeeksLoaded)
    })
    .finally(() => {
      // Remove from pending updates
      setPendingUpdates(prev => {
        const next = new Set(prev)
        next.delete(updateKey)
        return next
      })
    })
  }

  // Calculate overall percentage
  const calculateOverallPercentage = () => {
    if (weeks.length === 0 || habits.length === 0) return 0
    
    const currentWeek = weeks[currentWeekIndex]
    if (!currentWeek) return 0
    
    const totalTarget = currentWeek.habits.reduce((sum, h) => sum + h.target_frequency, 0)
    const totalSuccess = currentWeek.habits.reduce((sum, h) => sum + h.summary.successes, 0)
    
    return totalTarget > 0 ? Math.round((totalSuccess / totalTarget) * 100) : 0
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-400">Loading habits...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header with Add button and overall percentage */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-gray-400 uppercase tracking-wider">
          ALL HABITS
        </div>
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold text-white">
            {calculateOverallPercentage()}%
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-lg font-semibold hover:scale-105 transition-transform"
          >
            Add
          </button>
        </div>
      </div>

      {/* Week navigation */}
      {weeks.length > 1 && (
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setCurrentWeekIndex(Math.min(currentWeekIndex + 1, weeks.length - 1))}
            disabled={currentWeekIndex >= weeks.length - 1}
            className="px-3 py-1 bg-white/10 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
          >
            ← Previous Week
          </button>
          <span className="text-sm text-gray-400">
            {currentWeekIndex === 0 ? 'Current Week' : `${currentWeekIndex} week${currentWeekIndex > 1 ? 's' : ''} ago`}
          </span>
          <button
            onClick={() => setCurrentWeekIndex(Math.max(currentWeekIndex - 1, 0))}
            disabled={currentWeekIndex === 0}
            className="px-3 py-1 bg-white/10 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
          >
            Next Week →
          </button>
        </div>
      )}

      {/* Info about points limit */}
      {habits.length > 5 && (
        <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
          <p className="text-sm text-blue-400">
            ℹ️ Only your first 5 habits earn points (0.5 pts each when completed). You can track unlimited habits, but points are capped to encourage focus.
          </p>
        </div>
      )}

      {/* Habits list */}
      {habits.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-gray-400 mb-4">No habits yet. Create your first habit to get started!</p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-lg font-semibold hover:scale-105 transition-transform"
          >
            Create First Habit
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {weeks[currentWeekIndex]?.habits.map((habit, index) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              entries={habit.entries}
              summary={habit.summary}
              weekStart={weeks[currentWeekIndex].weekStart}
              currentDate={currentDate}
              isEligibleForPoints={index < 5}
              pendingUpdates={pendingUpdates}
              onStatusChange={handleStatusChange}
              onEdit={handleEditHabit}
              onDelete={handleDeleteHabit}
            />
          ))}
        </div>
      )}

      {/* Load more button */}
      {currentWeekIndex === weeks.length - 1 && weeks.length > 0 && (
        <div className="mt-8 text-center">
          <button
            onClick={loadMoreWeeks}
            disabled={loadingMore}
            className="px-6 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load More Weeks'}
          </button>
        </div>
      )}

      {/* Add Habit Dialog */}
      {showAddDialog && (
        <AddHabitDialog
          onAdd={handleAddHabit}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  )
}