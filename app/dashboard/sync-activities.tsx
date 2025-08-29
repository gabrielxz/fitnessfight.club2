'use client'

import { useState } from 'react'

export default function SyncActivities() {
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleSync = async () => {
    setSyncing(true)
    setMessage(null)

    try {
      const response = await fetch('/api/strava/sync', { method: 'POST' })
      
      if (response.ok) {
        const data = await response.json()
        setMessage({ 
          type: 'success', 
          text: `Successfully synced ${data.count} activities` 
        })
      } else {
        setMessage({ 
          type: 'error', 
          text: 'Failed to sync activities. Please try again.' 
        })
      }
    } catch {
      setMessage({ 
        type: 'error', 
        text: 'An error occurred while syncing.' 
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Sync Activities</h2>
          <p className="mt-1 text-sm text-gray-400">
            Import your recent activities from Strava.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-full text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {syncing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Syncing...
            </>
          ) : (
            'Sync Now'
          )}
        </button>
      </div>

      {message && (
        <div className={`mt-4 p-3 rounded ${
          message.type === 'success' 
            ? 'bg-green-900/50 text-green-300' 
            : 'bg-red-900/50 text-red-300'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  )
}