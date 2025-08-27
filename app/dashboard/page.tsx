import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StravaConnection from './strava-connection'
import WeeklyStats from './weekly-stats'
import SyncActivities from './sync-activities'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Fetch Strava connection data
  const { data: stravaConnection } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold">Fitness Fight Club</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">{user.email}</span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md text-sm font-medium text-gray-700"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Welcome to your Dashboard!
            </h2>
            
            <StravaConnection 
              isConnected={!!stravaConnection}
              stravaName={stravaConnection ? `${stravaConnection.strava_firstname} ${stravaConnection.strava_lastname}` : null}
              stravaProfile={stravaConnection?.strava_profile}
            />

            {stravaConnection && (
              <>
                <div className="mt-8">
                  <WeeklyStats userId={user.id} />
                </div>

                <div className="mt-6">
                  <SyncActivities />
                </div>

                <div className="mt-8 border-t pt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Coming Soon</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Custom leaderboards for your group</li>
                    <li>• Weekly and monthly challenges</li>
                    <li>• Advanced stats and progress tracking</li>
                    <li>• Activity comparisons with friends</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}