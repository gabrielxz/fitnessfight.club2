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

  // Verify the user still exists in user_divisions (hasn't been deleted)
  const { data: userExists } = await supabase
    .from('user_divisions')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  if (!userExists) {
    // User was deleted but session still exists - sign them out
    await supabase.auth.signOut()
    redirect('/login')
  }

  // Hardcoded admin check
  const isAdmin = user.email === 'gabrielbeal@gmail.com' || 
                  user.user_metadata?.full_name === 'Gabriel Beal' ||
                  user.user_metadata?.name === 'Gabriel Beal'

  if (!isAdmin) {
    redirect('/')
  }

  // Fetch all users who have divisions (which means they've signed up)
  const { data: allUserDivisions } = await supabase
    .from('user_divisions')
    .select('user_id')
  
  const userIds = allUserDivisions?.map(ud => ud.user_id) || []
  
  // Also fetch users from Strava connections (in case they're not in divisions yet)
  const { data: stravaConnections } = await supabase
    .from('strava_connections')
    .select('user_id, strava_athlete_id, strava_firstname, strava_lastname')
  
  // Combine user IDs from both sources
  const stravaUserIds = stravaConnections?.map(s => s.user_id) || []
  const allUserIds = Array.from(new Set([...userIds, ...stravaUserIds]))
  
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
  
  // For now, we'll use the Strava data and user divisions to show users
  // In production, you'd want to add a profiles table or use auth.users with service role
  const users = allUserIds.map(userId => {
    const stravaData = stravaMap.get(userId)
    
    return {
      user_id: userId,
      email: 'N/A', // We don't have access to emails without service role
      display_name: stravaData?.strava_name || `User ${userId.substring(0, 8)}`,
      strava_id: stravaData?.strava_id || '',
      has_strava: !!stravaData,
      created_at: new Date().toISOString()
    }
  })

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