'use client'

import { useState, useEffect } from 'react'
import { resetCompetition, getCompetitionStats } from './competition-reset-actions'

interface CompetitionStats {
  currentSeason: { name: string; starts_on: string } | null
  badgeCount: number
  activityCount: number
  habitEntryCount: number
  matchupCount: number
  usersWithPoints: number
  totalPoints: number
}

// Monday of the current week as YYYY-MM-DD, in the browser's local time.
function thisMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextSeasonName(current: string | undefined): string {
  const n = current?.match(/(\d+)\s*$/)
  return n ? current!.replace(/\d+\s*$/, String(Number(n[1]) + 1)) : ''
}

export default function CompetitionResetSection() {
  const [step, setStep] = useState(0) // 0: initial, 1: first confirm, 2: second confirm, 3: final confirm
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<CompetitionStats | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [seasonName, setSeasonName] = useState('')
  const [seasonStart, setSeasonStart] = useState(thisMonday())

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
      setSeasonName(prev => prev || nextSeasonName(data.currentSeason?.name))
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
      const result = await resetCompetition(confirmText, seasonName, seasonStart)
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
        <p className="text-green-300 mb-2">{seasonName} starts {seasonStart}. Competition data has been cleared.</p>
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
            This starts a new season and clears competition data. Points only count for weeks on or after the season start, and Strava activities from before it are not imported.
          </p>
          <div className="p-4 bg-yellow-900/30 border border-yellow-500 rounded mb-4">
            <p className="text-yellow-300 font-semibold mb-2">⚠️ WARNING: This action will permanently delete:</p>
            <ul className="text-yellow-200 text-sm space-y-1 ml-4">
              <li>• All earned badges and badge progress</li>
              <li>• All points (exercise, habit, and badge)</li>
              <li>• All Strava activity records</li>
              <li>• All rivalry matchups and kill marks (💀 skulls reset to 0)</li>
            </ul>
            <p className="text-green-300 font-semibold mt-3">✓ This will keep:</p>
            <ul className="text-green-200 text-sm space-y-1 ml-4">
              <li>• User accounts and profiles</li>
              <li>• Habits and their full history (pre-season weeks do not score)</li>
              <li>• Strava connections</li>
              <li>• Rivalry period schedule</li>
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
                <li>• {stats.matchupCount} rivalry matchups (all kill marks)</li>
                <li>• {stats.totalPoints.toLocaleString()} total points from {stats.usersWithPoints} users</li>
              </ul>
            </div>
          ) : (
            <p className="text-gray-400 mb-4">Loading statistics...</p>
          )}
          {stats && (
            <p className="text-gray-300 mb-4">
              Current season: {stats.currentSeason ? `${stats.currentSeason.name}, started ${stats.currentSeason.starts_on}` : 'none recorded'}
            </p>
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
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <label className="text-sm text-red-200">
                New season name
                <input
                  type="text"
                  value={seasonName}
                  onChange={(e) => setSeasonName(e.target.value)}
                  placeholder="Season 5"
                  className="mt-1 w-full px-3 py-2 bg-black/30 border border-red-500 rounded text-white placeholder-gray-500"
                  disabled={loading}
                />
              </label>
              <label className="text-sm text-red-200">
                Season start (a Monday)
                <input
                  type="date"
                  value={seasonStart}
                  onChange={(e) => setSeasonStart(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-black/30 border border-red-500 rounded text-white"
                  disabled={loading}
                />
              </label>
            </div>
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
              disabled={loading || confirmText !== 'RESET COMPETITION' || countdown > 0 || !seasonName.trim() || !seasonStart}
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