import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-500 to-purple-600">
      <div className="max-w-3xl mx-auto text-center px-4 sm:px-6 lg:px-8">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
          Fitness Fight Club
        </h1>
        <p className="text-xl md:text-2xl text-white/90 mb-12">
          Track your workouts. Compete with friends. Dominate the leaderboard.
        </p>
        <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
          <Link
            href="/login"
            className="inline-block bg-white text-purple-600 font-semibold py-3 px-8 rounded-full hover:bg-gray-100 transition duration-300 shadow-lg"
          >
            Get Started
          </Link>
          <Link
            href="/dashboard"
            className="inline-block bg-transparent text-white font-semibold py-3 px-8 rounded-full border-2 border-white hover:bg-white hover:text-purple-600 transition duration-300"
          >
            Go to Dashboard
          </Link>
        </div>
        <div className="mt-16 text-white/80">
          <p className="text-sm">
            Connect with Strava to automatically sync your workouts
          </p>
        </div>
      </div>
    </div>
  )
}