import { createClient } from '@/lib/supabase/server'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'
import LoggedInView from '@/app/components/LoggedInView'
import DivisionLeaderboard from '@/app/components/DivisionLeaderboard'
import WeekProgress from '@/app/components/WeekProgress'
import InstallPrompt from '@/app/components/InstallPrompt'

const divisionEmojis: Record<string, string> = {
  'Noodle': '🍜',
  'Sweaty': '💦',
  'Shreddy': '💪',
  'Juicy': '🧃'
}

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // For logged-in users, fetch their division
  let userDivision = null
  if (user) {
    const { data } = await supabase
      .from('user_divisions')
      .select('*, divisions(*)')
      .eq('user_id', user.id)
      .single()
    userDivision = data
  }
  
  const division = userDivision?.divisions || { name: 'Noodle', level: 1, emoji: '🍜' }

  // Fetch all divisions (Juicy first)
  const { data: divisions } = await supabase
    .from('divisions')
    .select('*')
    .order('level', { ascending: false }) // Juicy (4) first, then descending

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <Navigation user={user} />
      
      <main className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl lg:text-7xl font-black mb-4">
              <span className="gradient-text">Fitness Fight Club</span>
            </h1>
            <p className="text-gray-400 text-lg">Points. Badges. Flex.</p>
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 glass-card">
              <span>📅</span>
              <span className="text-sm text-gray-300">
                Week {getWeekNumber()} of {new Date().getFullYear()}
              </span>
            </div>
          </div>
          
          {user ? (
            // Logged in view: Show dashboard with division selector
            <LoggedInView 
              userId={user.id} 
              userDivision={division} 
              allDivisions={divisions || []} 
            />
          ) : (
            // Not logged in view: Show all divisions with emojis
            <>
              {divisions?.map(division => (
                <div key={division.id} className="mb-8">
                  <h2 className="text-3xl font-bold text-white mb-4">
                    <span className="mr-2">{divisionEmojis[division.name] || '🏆'}</span>
                    {division.name} Division
                  </h2>
                  <DivisionLeaderboard userId={null} divisionId={division.id} />
                </div>
              ))}
              <WeekProgress />
            </>
          )}
        </div>
      </main>
      <InstallPrompt />
    </div>
  )
}

function getWeekNumber() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24 * 7))
}