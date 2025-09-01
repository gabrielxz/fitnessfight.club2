'use client'

import { useState } from 'react'

interface EditHabitDialogProps {
  habit: {
    id: string
    name: string
    target_frequency: number
  }
  onSave: (name: string, targetFrequency: number) => void
  onClose: () => void
}

export default function EditHabitDialog({ habit, onSave, onClose }: EditHabitDialogProps) {
  const [name, setName] = useState(habit.name)
  const [targetFrequency, setTargetFrequency] = useState(habit.target_frequency)
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Please enter a habit name')
      return
    }
    
    if (name.length > 100) {
      setError('Name must be 100 characters or less')
      return
    }
    
    onSave(name.trim(), targetFrequency)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4 text-white">Edit Habit</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Habit Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="e.g., Morning meditation"
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
              maxLength={100}
              autoFocus
            />
            {error && (
              <p className="text-red-400 text-sm mt-1">{error}</p>
            )}
            <p className="text-gray-400 text-xs mt-1">{name.length}/100 characters</p>
          </div>
          
          <div className="mb-6">
            <label htmlFor="frequency" className="block text-sm font-medium text-gray-300 mb-2">
              Target Days Per Week
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                id="frequency"
                min="1"
                max="7"
                value={targetFrequency}
                onChange={(e) => setTargetFrequency(parseInt(e.target.value))}
                className="flex-1"
              />
              <div className="w-12 text-center">
                <span className="text-2xl font-bold text-orange-500">{targetFrequency}</span>
                <span className="text-gray-400 text-sm block">days</span>
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1</span>
              <span>7</span>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-lg font-semibold hover:scale-105 transition-transform"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-white/10 text-gray-300 rounded-lg font-semibold hover:bg-white/20 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}