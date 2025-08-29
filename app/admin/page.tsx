import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminDashboard from './AdminDashboard'

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

  // Fetch all users
  const { data: users } = await supabase
    .from('strava_connections')
    .select('user_id, strava_id, display_name')
    .order('display_name')

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
    <AdminDashboard 
      users={users || []}
      badges={badges || []}
      divisions={divisions || []}
      userDivisions={userDivisions || []}
      userBadges={userBadges || []}
    />
  )
}