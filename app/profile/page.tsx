import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'
import StravaConnection from '@/app/components/strava-connection'
import SyncActivities from '@/app/components/sync-activities'
import TimezoneSettings from '@/app/components/TimezoneSettings'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  

  const { data: stravaConnection } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <Navigation user={user} />
      
      <main className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8">Profile</h1>
          <div className="space-y-8">
            <StravaConnection
              isConnected={!!stravaConnection}
              stravaName={stravaConnection ? `${stravaConnection.strava_firstname} ${stravaConnection.strava_lastname}` : null}
              stravaProfile={stravaConnection?.strava_profile}
            />
            <SyncActivities />
            <TimezoneSettings />
          </div>
        </div>
      </main>
    </div>
  )
}