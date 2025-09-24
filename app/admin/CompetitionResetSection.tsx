'use client'

import { useState, useEffect } from 'react'
import { resetCompetition, getCompetitionStats } from './competition-reset-actions'

interface CompetitionStats {
  badgeCount: number
  activityCount: number
  habitEntryCount: number
  usersWithPoints: number
  totalPoints: number
}

export default function CompetitionResetSection() {
  const [step, setStep] = useState(0) // 0: initial, 1: first confirm, 2: second confirm, 3: final confirm
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<CompetitionStats | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    if (step === 1) {
      loadStats()
    }
  }, [step])

  useEffect(() => {
    if (step === 3 && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [step, countdown])

  const loadStats = async () => {
    try {
      const data = await getCompetitionStats()
      setStats(data)
    } catch {
      setError('Failed to load statistics')
    }
  }

  const handleReset = async () => {
    if (confirmText !== 'RESET COMPETITION') {
      setError('Confirmation text must be exactly: RESET COMPETITION')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await resetCompetition(confirmText)
      setSuccess(true)
      console.log('Reset successful:', result)

      // Show success for 5 seconds then reload
      setTimeout(() => {
        window.location.reload()
      }, 5000)
    } catch (err) {
      setError((err as Error).message || 'Reset failed')
      setLoading(false)
    }
  }

  const cancelReset = () => {
    setStep(0)
    setConfirmText('')
    setError('')
    setCountdown(10)
  }

  if (success) {
    return (
      <div className="p-6 bg-green-900/30 border border-green-500 rounded-lg">
        <h3 className="text-2xl font-bold text-green-400 mb-3">✅ Competition Reset Complete!</h3>
        <p className="text-green-300 mb-2">All competition data has been cleared successfully.</p>
        <p className="text-sm text-gray-400">The page will refresh in 5 seconds...</p>
      </div>
    )
  }

  return (
    <div className={`p-6 ${step > 0 ? 'bg-red-900/20 border-2 border-red-500' : 'bg-black/20 border border-white/10'} rounded-lg transition-all`}>
      <h3 className="text-xl font-bold text-white mb-4">
        🚨 Competition Reset - Nuclear Option 🚨
      </h3>

      {step === 0 && (
        <>
          <p className="text-gray-300 mb-4">
            This will completely reset the competition for a fresh start. Use this when starting a new competition period.
          </p>
          <div className="p-4 bg-yellow-900/30 border border-yellow-500 rounded mb-4">
            <p className="text-yellow-300 font-semibold mb-2">⚠️ WARNING: This action will permanently delete:</p>
            <ul className="text-yellow-200 text-sm space-y-1 ml-4">
              <li>• All earned badges from all users</li>
              <li>• All points (exercise, habit, and badge points)</li>
              <li>• All Strava activity records</li>
              <li>• All habit success/failure records</li>
            </ul>
            <p className="text-green-300 font-semibold mt-3">✓ This will keep:</p>
            <ul className="text-green-200 text-sm space-y-1 ml-4">
              <li>• User accounts and profiles</li>
              <li>• Current division assignments</li>
              <li>• Habit definitions (but not their history)</li>
              <li>• Strava connections</li>
            </ul>
          </div>
          <button
            onClick={() => setStep(1)}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded transition-colors"
          >
            Begin Reset Process
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h4 className="text-lg font-semibold text-red-400 mb-3">First Confirmation - Review Impact</h4>
          {stats ? (
            <div className="p-4 bg-red-950/50 border border-red-700 rounded mb-4">
              <p className="text-red-300 font-semibold mb-2">This will delete:</p>
              <ul className="text-red-200 space-y-1">
                <li>• {stats.badgeCount} earned badges</li>
                <li>• {stats.activityCount} Strava activities</li>
                <li>• {stats.habitEntryCount} habit tracking entries</li>
                <li>• {stats.totalPoints} total points from {stats.usersWithPoints} users</li>
              </ul>
            </div>
          ) : (
            <p className="text-gray-400 mb-4">Loading statistics...</p>
          )}
          <p className="text-yellow-300 mb-4">
            Are you absolutely sure you want to proceed? This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-3 bg-red-700 hover:bg-red-800 text-white font-bold rounded transition-colors"
            >
              Yes, Continue to Next Step
            </button>
            <button
              onClick={cancelReset}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h4 className="text-lg font-semibold text-red-400 mb-3">Second Confirmation - Final Warning</h4>
          <div className="p-4 bg-red-950/70 border-2 border-red-600 rounded mb-4">
            <p className="text-red-300 font-bold text-lg mb-2">⚠️ FINAL WARNING ⚠️</p>
            <p className="text-red-200">
              You are about to permanently delete ALL competition data.
              There is NO undo button. No backup. No recovery.
            </p>
            <p className="text-red-200 mt-2">
              Only proceed if you are 100% certain this is what you want to do.
            </p>
          </div>
          <p className="text-yellow-300 mb-4">
            This is your last chance to cancel. Do you want to proceed?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(3)}
              className="px-6 py-3 bg-red-800 hover:bg-red-900 text-white font-bold rounded transition-colors"
            >
              Yes, Show Final Confirmation
            </button>
            <button
              onClick={cancelReset}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded transition-colors"
            >
              Cancel - Do Not Reset
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h4 className="text-lg font-semibold text-red-400 mb-3">Final Step - Type Confirmation</h4>
          <div className="p-4 bg-red-950/90 border-2 border-red-500 rounded mb-4">
            <p className="text-red-300 font-bold mb-3">
              To proceed with the reset, type exactly: <span className="font-mono bg-black/50 px-2 py-1 rounded">RESET COMPETITION</span>
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type confirmation text here"
              className="w-full px-4 py-2 bg-black/30 border border-red-500 rounded text-white placeholder-gray-500"
              disabled={loading || countdown > 0}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded mb-4">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          <div className="flex gap-3 items-center">
            <button
              onClick={handleReset}
              disabled={loading || confirmText !== 'RESET COMPETITION' || countdown > 0}
              className={`px-6 py-3 font-bold rounded transition-all ${
                countdown > 0
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : confirmText === 'RESET COMPETITION'
                  ? 'bg-red-900 hover:bg-red-950 text-white animate-pulse'
                  : 'bg-red-800 text-gray-300 cursor-not-allowed opacity-50'
              }`}
            >
              {loading ? 'Resetting...' : countdown > 0 ? `Available in ${countdown}s` : '🔴 EXECUTE RESET 🔴'}
            </button>
            <button
              onClick={cancelReset}
              disabled={loading}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded transition-colors"
            >
              Cancel
            </button>
          </div>

          {countdown > 0 && (
            <p className="text-sm text-gray-400 mt-3">
              Button will be enabled in {countdown} seconds to prevent accidental clicks...
            </p>
          )}
        </>
      )}
    </div>
  )
}