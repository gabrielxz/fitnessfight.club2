'use client'

import Image from 'next/image'
import Link from 'next/link'

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
  if (isConnected && stravaName) {
    return (
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {stravaProfile && (
              <img
                src={stravaProfile}
                alt={stravaName}
                className="h-12 w-12 rounded-full"
              />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">Strava Account</p>
              <p className="text-lg font-semibold text-gray-900">{stravaName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
              Connected
            </span>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to disconnect your Strava account?')) {
                  // TODO: Implement disconnect functionality
                  console.log('Disconnecting Strava...')
                }
              }}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-orange-50 rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Connect to Strava</h3>
          <p className="mt-1 text-sm text-gray-600">
            Link your Strava account to automatically sync your activities
          </p>
        </div>
        <Link
          href="/api/strava/connect"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
        >
          <svg 
            className="w-5 h-5 mr-2" 
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Connect to Strava
        </Link>
      </div>
    </div>
  )
}