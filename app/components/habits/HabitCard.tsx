'use client'

import { useState } from 'react'
import HabitWeekView from './HabitWeekView'
import EditHabitDialog from './EditHabitDialog'

interface HabitCardProps {
  habit: {
    id: string
    name: string
    target_frequency: number
  }
  entries: Array<{
    id: string
    habit_id: string
    date: string
    status: 'SUCCESS' | 'FAILURE' | 'NEUTRAL'
  }>
  summary: {
    successes: number
    target: number
    percentage: number
  }
  weekStart: string
  currentDate: string
  isEligibleForPoints?: boolean
  pendingUpdates?: Set<string>
  onStatusChange: (habitId: string, date: string, status: 'SUCCESS' | 'FAILURE' | 'NEUTRAL') => void
  onEdit: (habitId: string, name: string, targetFrequency: number) => void
  onDelete: (habitId: string) => void
}

export default function HabitCard({
  habit,
  entries,
  summary,
  weekStart,
  currentDate,
  isEligibleForPoints = true,
  pendingUpdates,
  onStatusChange,
  onEdit,
  onDelete
}: HabitCardProps) {
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleEdit = (name: string, targetFrequency: number) => {
    onEdit(habit.id, name, targetFrequency)
    setShowEditDialog(false)
  }

  const handleDelete = () => {
    onDelete(habit.id)
    setShowDeleteConfirm(false)
  }

  return (
    <>
      <div className="glass-card p-6">
        {/* Habit header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-white">{habit.name}</h3>
              {isEligibleForPoints && summary.successes >= summary.target && (
                <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full font-medium">
                  +0.5 pts
                </span>
              )}
              {!isEligibleForPoints && (
                <span className="text-xs px-2 py-1 bg-gray-500/20 text-gray-400 rounded-full">
                  No points
                </span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              This week: {summary.successes}/{summary.target}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEditDialog(true)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Edit habit"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Delete habit"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Week view */}
        <HabitWeekView
          habitId={habit.id}
          entries={entries}
          weekStart={weekStart}
          currentDate={currentDate}
          pendingUpdates={pendingUpdates}
          onStatusChange={onStatusChange}
        />

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mt-4 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
            <p className="text-sm text-red-400 mb-3">Are you sure you want to delete this habit?</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="px-3 py-1 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1 bg-white/10 text-gray-400 rounded-lg hover:bg-white/20 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {showEditDialog && (
        <EditHabitDialog
          habit={habit}
          onSave={handleEdit}
          onClose={() => setShowEditDialog(false)}
        />
      )}
    </>
  )
}