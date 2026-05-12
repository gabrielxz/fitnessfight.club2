'use client'

import { useState } from 'react'

export default function CompetitionUpdateGenerator() {
  const [loading, setLoading] = useState(false)
  const [update, setUpdate] = useState('')
  const [showCopied, setShowCopied] = useState(false)
  const [error, setError] = useState('')
  const [priming, setPriming] = useState('')

  const generateUpdate = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/generate-competition-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priming: priming.trim() || undefined }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate update')
      }

      const data = await response.json()
      setUpdate(data.update)
    } catch (err) {
      console.error('Error generating competition update:', err)
      setError((err as Error).message || 'Failed to generate update. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!update) return

    try {
      await navigator.clipboard.writeText(update)
      setShowCopied(true)
      setTimeout(() => setShowCopied(false), 2000)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = update
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        document.execCommand('copy')
        setShowCopied(true)
        setTimeout(() => setShowCopied(false), 2000)
      } catch {
        setError('Failed to copy to clipboard')
      }
      document.body.removeChild(textArea)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Generate Competition Update</h3>
          <p className="text-sm text-gray-400">
            AI-written weekly recap for WhatsApp — leaderboard, badges, rivalries, top performers
          </p>
        </div>
        <button
          onClick={generateUpdate}
          disabled={loading}
          className="shrink-0 px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 transition-all"
        >
          {loading ? 'Generating...' : '✨ Generate Update'}
        </button>
      </div>

      <div>
        <label htmlFor="priming-input" className="block text-sm font-medium text-gray-300 mb-1">
          Optional: extra context for the AI
        </label>
        <textarea
          id="priming-input"
          value={priming}
          onChange={(e) => setPriming(e.target.value)}
          placeholder="e.g. Don't forget to mention Amy this week, or call out the comeback story."
          rows={2}
          className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-purple-400"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-red-300">
          {error}
        </div>
      )}

      {update && (
        <div className="space-y-3">
          <div className="p-4 bg-black/30 border border-white/20 rounded">
            <div className="flex justify-between items-start mb-3">
              <h4 className="font-medium text-sm text-gray-300">Preview</h4>
              <button
                onClick={copyToClipboard}
                className={`px-4 py-1 rounded text-sm font-medium transition-all ${
                  showCopied
                    ? 'bg-green-600 text-white'
                    : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600'
                }`}
              >
                {showCopied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm font-mono text-gray-200 leading-relaxed">
              {update}
            </pre>
          </div>

          <div className="text-xs text-gray-400">
            <p>📋 Click &quot;Copy to Clipboard&quot; then paste into your WhatsApp group</p>
            <p>💡 The formatting (*bold* and _italic_) will appear correctly in WhatsApp</p>
          </div>
        </div>
      )}
    </div>
  )
}
