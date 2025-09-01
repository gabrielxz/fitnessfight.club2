'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
      <div className="text-center p-8 max-w-md">
        <div className="mb-6">
          <svg 
            className="w-24 h-24 mx-auto text-gray-600"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={1.5} 
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
            />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-3">
          You&apos;re Offline
        </h1>
        
        <p className="text-gray-400 mb-6">
          It looks like you&apos;ve lost your internet connection. 
          Some features may be limited until you&apos;re back online.
        </p>

        <div className="space-y-3">
          <div className="bg-gray-800/50 rounded-lg p-4 text-left">
            <h3 className="text-white font-semibold mb-1">What you can do:</h3>
            <ul className="text-gray-400 text-sm space-y-1">
              <li>• View cached leaderboard data</li>
              <li>• Check your recent stats</li>
              <li>• Review your badges</li>
            </ul>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4 text-left">
            <h3 className="text-white font-semibold mb-1">What requires connection:</h3>
            <ul className="text-gray-400 text-sm space-y-1">
              <li>• Syncing new Strava activities</li>
              <li>• Updating habit tracking</li>
              <li>• Viewing live leaderboards</li>
            </ul>
          </div>
        </div>

        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}