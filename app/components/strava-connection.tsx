'use client'

import Image from 'next/image'
import { useState } from 'react'

interface StravaConnectionProps {
  isConnected: boolean
  stravaName: string | null
  stravaProfile: string | null
}

export default function StravaConnection({ 
  isConnected, 
  stravaName, 
  stravaProfile 
}: StravaConnectionProps) {
  const [connecting, setConnecting] = useState(false)
  if (isConnected && stravaName) {
    return (
      <div className="glass-card p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Strava Account</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {stravaProfile && (
              <Image
                src={stravaProfile}
                alt={stravaName}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full"
              />
            )}
            <div>
              <p className="text-lg font-semibold text-white">{stravaName}</p>
              <span className="text-sm text-green-400">Connected</span>
            </div>
          </div>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to disconnect your Strava account?')) {
                // TODO: Implement disconnect functionality
                console.log('Disconnecting Strava...')
              }
            }}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card p-6">
      <h2 className="text-2xl font-bold text-white mb-4">Connect to Strava</h2>
      <p className="text-gray-400 mb-6">
        Link your Strava account to automatically sync your activities and join the fight.
      </p>
      <button
        type="button"
        onClick={() => {
          if (connecting) return
          setConnecting(true)
          // Use hard navigation to avoid client-side prefetch/transition quirks on iOS
          window.location.href = '/api/strava/connect'
        }}
        className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-full text-white bg-orange-600 hover:bg-orange-700 ${connecting ? 'opacity-70 cursor-not-allowed' : ''}`}
        disabled={connecting}
      >
        <svg 
          className="w-5 h-5 mr-2" 
          viewBox="0 0 24 24" 
          fill="currentColor"
        >
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
        {connecting ? 'Redirecting…' : 'Connect with Strava'}
      </button>
    </div>
  )
}
