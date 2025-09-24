'use client'

import { useState, useEffect } from 'react'
import {
  getSummaryParticipants,
  addSummaryParticipant,
  removeSummaryParticipant,
  updateSummaryParticipant
} from './summary-actions'

interface User {
  user_id: string
  email: string
  display_name: string
  strava_id: string
  has_strava: boolean
  has_division: boolean
  created_at: string
}

interface Participant {
  id: string
  user_id: string
  display_name: string | null
  include_in_summary: boolean
  sort_order: number
  user_profiles: {
    id: string
    full_name: string | null
    email: string | null
  }
  strava_connections?: Array<{
    strava_firstname: string | null
    strava_lastname: string | null
  }>
}

interface Props {
  users: User[]
}

export default function SummaryParticipantsManager({ users }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [customName, setCustomName] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    loadParticipants()
  }, [])

  const loadParticipants = async () => {
    try {
      const data = await getSummaryParticipants()
      setParticipants(data)
    } catch {
      console.error('Error loading participants')
    }
  }

  const handleAdd = async () => {
    if (!selectedUserId) return

    setLoading(true)
    try {
      await addSummaryParticipant(selectedUserId, customName || undefined)
      await loadParticipants()
      setSelectedUserId('')
      setCustomName('')
    } catch (error) {
      alert((error as Error).message || 'Failed to add participant')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this participant from habit summaries?')) return

    try {
      await removeSummaryParticipant(id)
      await loadParticipants()
    } catch {
      alert('Failed to remove participant')
    }
  }

  const handleToggle = async (id: string, currentState: boolean) => {
    try {
      await updateSummaryParticipant(id, {
        include_in_summary: !currentState
      })
      await loadParticipants()
    } catch {
      alert('Failed to update participant')
    }
  }

  const handleEditName = async (id: string) => {
    try {
      await updateSummaryParticipant(id, {
        display_name: editName || null
      })
      setEditingId(null)
      setEditName('')
      await loadParticipants()
    } catch {
      alert('Failed to update name')
    }
  }

  const getDisplayName = (participant: Participant) => {
    if (participant.display_name) return participant.display_name

    if (participant.strava_connections?.[0]) {
      const conn = participant.strava_connections[0]
      return `${conn.strava_firstname || ''} ${conn.strava_lastname || ''}`.trim()
    }

    return participant.user_profiles?.full_name ||
           participant.user_profiles?.email?.split('@')[0] ||
           'Unknown'
  }

  // Filter out users who are already participants
  const participantUserIds = participants.map(p => p.user_id)
  const availableUsers = users.filter(u => !participantUserIds.includes(u.user_id))

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">Summary Participants</h3>
        <p className="text-sm text-gray-300 mb-4">
          These users will be included in the weekly habit summary message.
        </p>

        {/* Add new participant */}
        <div className="flex gap-2 mb-4">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded text-white"
            disabled={loading}
          >
            <option value="">Select a user to add...</option>
            {availableUsers.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name} ({user.email})
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Custom name (optional)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="px-3 py-2 bg-black/20 border border-white/10 rounded text-white"
            disabled={loading}
          />
          <button
            onClick={handleAdd}
            disabled={!selectedUserId || loading}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded hover:from-orange-600 hover:to-yellow-600 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {/* Participants list */}
        <div className="space-y-2">
          {participants.length === 0 ? (
            <p className="text-gray-400 py-4">No participants added yet.</p>
          ) : (
            participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between p-3 bg-black/20 rounded border border-white/10"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={participant.include_in_summary}
                    onChange={() => handleToggle(participant.id, participant.include_in_summary)}
                    className="w-4 h-4"
                  />
                  <div>
                    {editingId === participant.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder={getDisplayName(participant)}
                          className="px-2 py-1 bg-black/30 border border-white/20 rounded text-white"
                          autoFocus
                        />
                        <button
                          onClick={() => handleEditName(participant.id)}
                          className="px-2 py-1 bg-green-600 text-white rounded text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null)
                            setEditName('')
                          }}
                          className="px-2 py-1 bg-gray-600 text-white rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className={`font-medium ${!participant.include_in_summary ? 'opacity-50' : ''}`}>
                          {getDisplayName(participant)}
                        </span>
                        {participant.display_name && (
                          <span className="text-sm text-gray-400 ml-2">
                            (custom name)
                          </span>
                        )}
                      </>
                    )}
                    <div className="text-sm text-gray-400">
                      {participant.user_profiles?.email}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(participant.id)
                      setEditName(participant.display_name || '')
                    }}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Edit Name
                  </button>
                  <button
                    onClick={() => handleRemove(participant.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {participants.length > 0 && (
          <p className="text-sm text-gray-400 mt-3">
            {participants.filter(p => p.include_in_summary).length} of {participants.length} participants
            will be included in the summary
          </p>
        )}
      </div>
    </div>
  )
}