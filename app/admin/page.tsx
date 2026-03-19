import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  // Use admin client to fetch ALL users from auth.users
  let authUsers: { users: Array<{
    id: string
    email?: string
    created_at?: string
    user_metadata?: Record<string, unknown>
  }> } | null = null

  try {
    const adminClient = createAdminClient()
    const result = await adminClient.auth.admin.listUsers()
    authUsers = result.data
    if (result.error) {
      console.error('Error fetching users:', result.error)
    }
  } catch (error) {
    console.error('Failed to create admin client or fetch users:', error)
    authUsers = { users: [] }
  }

  // Fetch user profiles
  const { data: userProfiles } = await supabase
    .from('user_profiles')
    .select('*')

  const profileMap = new Map(
    userProfiles?.map(p => [p.id, p]) || []
  )

  // Fetch Strava connections
  const { data: stravaConnections } = await supabase
    .from('strava_connections')
    .select('user_id, strava_athlete_id, strava_firstname, strava_lastname')

  const stravaMap = new Map(
    stravaConnections?.map(s => [
      s.user_id,
      {
        strava_id: s.strava_athlete_id?.toString() || '',
        strava_name: `${s.strava_firstname || ''} ${s.strava_lastname || ''}`.trim()
      }
    ]) || []
  )

  const users = authUsers?.users?.map(authUser => {
    const profile = profileMap.get(authUser.id)
    const stravaData = stravaMap.get(authUser.id)

    const displayName = stravaData?.strava_name ||
                       profile?.full_name ||
                       (authUser.user_metadata?.full_name as string) ||
                       (authUser.user_metadata?.name as string) ||
                       authUser.email?.split('@')[0] ||
                       'Unknown User'

    return {
      user_id: authUser.id,
      email: authUser.email || 'N/A',
      display_name: displayName,
      strava_id: stravaData?.strava_id || '',
      has_strava: !!stravaData,
      created_at: authUser.created_at || new Date().toISOString()
    }
  }) || []

  // Fetch all active badges
  const { data: badges } = await supabase
    .from('badges')
    .select('*')
    .eq('active', true)
    .order('name')

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
        userBadges={userBadges || []}
      />
    </div>
  )
}
