'use client'

import { useState } from 'react'

export default function HabitSummaryGenerator() {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [showCopied, setShowCopied] = useState(false)
  const [error, setError] = useState('')

  const generateSummary = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/generate-habit-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weekOffset: 0 // 0 = last completed week
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate summary')
      }

      const data = await response.json()
      setSummary(data.summary)
    } catch (error) {
      console.error('Error generating summary:', error)
      setError('Failed to generate summary. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!summary) return

    try {
      await navigator.clipboard.writeText(summary)
      setShowCopied(true)
      setTimeout(() => setShowCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = summary
      textArea.style.position = "fixed"
      textArea.style.left = "-999999px"
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

  const formatDate = () => {
    const now = new Date()
    const lastMonday = new Date(now)
    const dayOfWeek = now.getUTCDay()
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek + 6
    lastMonday.setDate(now.getDate() - daysToLastMonday)

    const lastSunday = new Date(lastMonday)
    lastSunday.setDate(lastMonday.getDate() + 6)

    return `${lastMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${lastSunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Generate Habit Summary</h3>
          <p className="text-sm text-gray-400">
            Generate WhatsApp message for last week ({formatDate()})
          </p>
        </div>
        <button
          onClick={generateSummary}
          disabled={loading}
          className="px-6 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold rounded hover:from-orange-600 hover:to-yellow-600 disabled:opacity-50 transition-all"
        >
          {loading ? 'Generating...' : 'Generate Habit Message'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-red-300">
          {error}
        </div>
      )}

      {summary && (
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
              {summary}
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