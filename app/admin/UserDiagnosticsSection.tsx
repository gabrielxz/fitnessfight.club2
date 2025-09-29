'use client'

import { useState } from 'react'
import { ensureUserDataConsistency, getUserDataDiagnostics } from './user-fix-actions'

interface User {
  user_id: string
  email: string
  display_name: string
  has_strava: boolean
  has_division: boolean
}

interface Props {
  users: User[]
}

export default function UserDiagnosticsSection({ users }: Props) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [diagnostics, setDiagnostics] = useState<{
    userId: string
    hasAuthUser: boolean
    authUserEmail?: string
    hasProfile: boolean
    profileData: Record<string, unknown> | null
    hasDivision: boolean
    divisionData: Record<string, unknown> | null
    hasStravaConnection: boolean
    stravaData: Record<string, unknown> | null
  } | null>(null)
  const [message, setMessage] = useState('')

  // Find users who might have issues
  const usersWithIssues = users.filter(u => u.has_strava && !u.has_division)

  const handleDiagnostics = async () => {
    if (!selectedUserId) return

    setLoading(true)
    setMessage('')
    try {
      const result = await getUserDataDiagnostics(selectedUserId)
      setDiagnostics(result)
    } catch (error) {
      setMessage(`Error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleFix = async () => {
    if (!selectedUserId) return

    setLoading(true)
    setMessage('')
    try {
      const result = await ensureUserDataConsistency(selectedUserId)
      setMessage(`✅ ${result.message}`)
      setDiagnostics(null)
      // Refresh diagnostics after fix
      setTimeout(() => {
        handleDiagnostics()
      }, 1000)
    } catch (error) {
      setMessage(`❌ Error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">User Data Diagnostics & Repair</h3>
        <p className="text-sm text-gray-400 mb-4">
          Use this tool to diagnose and fix users who aren&apos;t showing up correctly (e.g., have Strava but no division).
        </p>

        {usersWithIssues.length > 0 && (
          <div className="p-3 bg-yellow-900/30 border border-yellow-500 rounded mb-4">
            <p className="text-yellow-300 font-semibold">⚠️ {usersWithIssues.length} user(s) with potential issues:</p>
            <ul className="text-yellow-200 text-sm mt-2 space-y-1">
              {usersWithIssues.map(u => (
                <li key={u.user_id}>• {u.display_name} ({u.email}) - Has Strava but no division</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <select
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value)
              setDiagnostics(null)
              setMessage('')
            }}
            className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded text-white"
            disabled={loading}
          >
            <option value="">Select a user to diagnose...</option>
            {users.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name} ({user.email}) {!user.has_division ? '⚠️ NO DIVISION' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleDiagnostics}
            disabled={!selectedUserId || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Diagnose'}
          </button>
        </div>

        {message && (
          <div className={`p-3 rounded mb-4 ${
            message.startsWith('✅')
              ? 'bg-green-900/30 border border-green-500 text-green-300'
              : 'bg-red-900/30 border border-red-500 text-red-300'
          }`}>
            {message}
          </div>
        )}

        {diagnostics && (
          <div className="p-4 bg-black/30 border border-white/20 rounded space-y-3">
            <h4 className="font-semibold text-white">Diagnostic Results:</h4>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={diagnostics.hasAuthUser ? 'text-green-400' : 'text-red-400'}>
                  {diagnostics.hasAuthUser ? '✓' : '✗'}
                </span>
                <span className="text-gray-300">
                  Auth User: {diagnostics.hasAuthUser ? `Yes (${diagnostics.authUserEmail})` : 'No'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={diagnostics.hasProfile ? 'text-green-400' : 'text-red-400'}>
                  {diagnostics.hasProfile ? '✓' : '✗'}
                </span>
                <span className="text-gray-300">
                  User Profile: {diagnostics.hasProfile ? 'Yes' : 'Missing'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={diagnostics.hasDivision ? 'text-green-400' : 'text-red-400'}>
                  {diagnostics.hasDivision ? '✓' : '✗'}
                </span>
                <span className="text-gray-300">
                  Division Assignment: {diagnostics.hasDivision ? 'Yes' : 'Missing'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={diagnostics.hasStravaConnection ? 'text-green-400' : 'text-gray-500'}>
                  {diagnostics.hasStravaConnection ? '✓' : '○'}
                </span>
                <span className="text-gray-300">
                  Strava Connection: {diagnostics.hasStravaConnection ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {(!diagnostics.hasProfile || !diagnostics.hasDivision) && (
              <div className="pt-3 border-t border-white/10">
                <button
                  onClick={handleFix}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded disabled:opacity-50"
                >
                  {loading ? 'Fixing...' : '🔧 Fix Missing Data'}
                </button>
                <p className="text-xs text-gray-400 mt-2">
                  This will create missing user_profiles and assign to Noodle division if needed.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}