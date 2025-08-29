import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminDashboard from './AdminDashboard'
import Navigation from '@/app/components/Navigation'
import AnimatedBackground from '@/app/components/AnimatedBackground'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Hardcoded admin check
  const isAdmin = user.email === 'gabrielbeal@gmail.com' || 
                  user.user_metadata?.full_name === 'Gabriel Beal' ||
                  user.user_metadata?.name === 'Gabriel Beal'

  if (!isAdmin) {
    redirect('/')
  }

  // Fetch all users from strava_connections with proper column names
  const { data: stravaUsers } = await supabase
    .from('strava_connections')
    .select('user_id, strava_athlete_id, strava_firstname, strava_lastname')

  // Format the users with display names
  const users = stravaUsers?.map(u => ({
    user_id: u.user_id,
    strava_id: u.strava_athlete_id?.toString() || '',
    display_name: `${u.strava_firstname || ''} ${u.strava_lastname || ''}`.trim() || 'Unknown User'
  })) || []

  // Fetch all badges
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true)
    .order('name')

  // Fetch all divisions
  const { data: divisions } = await supabase
    .from('divisions')
    .select('*')
    .order('level', { ascending: false })

  // Fetch user divisions
  const { data: userDivisions } = await supabase
    .from('user_divisions')
    .select('*')

  // Fetch user badges
  const { data: userBadges } = await supabase
    .from('user_badges')
    .select('*')

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <Navigation user={user} />
      <AdminDashboard 
        users={users}
        badges={badges || []}
        divisions={divisions || []}
        userDivisions={userDivisions || []}
        userBadges={userBadges || []}
      />
    </div>
  )
}