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

  // Fetch all users from auth
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  
  // Fetch Strava connections
  const { data: stravaConnections } = await supabase
    .from('strava_connections')
    .select('user_id, strava_athlete_id, strava_firstname, strava_lastname')
  
  // Create a map of Strava connections for quick lookup
  const stravaMap = new Map(
    stravaConnections?.map(s => [
      s.user_id,
      {
        strava_id: s.strava_athlete_id?.toString() || '',
        strava_name: `${s.strava_firstname || ''} ${s.strava_lastname || ''}`.trim()
      }
    ]) || []
  )
  
  // Combine auth users with Strava data
  const users = authUsers?.users?.map(u => {
    const stravaData = stravaMap.get(u.id)
    const authName = u.user_metadata?.full_name || 
                    u.user_metadata?.name || 
                    u.email?.split('@')[0] || 
                    'User'
    
    return {
      user_id: u.id,
      email: u.email || '',
      display_name: stravaData?.strava_name || authName,
      strava_id: stravaData?.strava_id || '',
      has_strava: !!stravaData,
      created_at: u.created_at
    }
  }) || []

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