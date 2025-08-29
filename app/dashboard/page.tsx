import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'
import DivisionSelector from './DivisionSelector'
import DivisionLeaderboard from './DivisionLeaderboard'
import WeekProgress from './WeekProgress'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')
  
  // Fetch user division and stats
  const { data: userDivision } = await supabase
    .from('user_divisions')
    .select('*, divisions(*)')
    .eq('user_id', user.id)
    .single()
    
  const division = userDivision?.divisions || { name: 'Noodle', level: 1, emoji: '🍜' }
  
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
            <p className="text-gray-400 text-lg">Compete. Conquer. Champion.</p>
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 glass-card">
              <span>📅</span>
              <span className="text-sm text-gray-300">
                Week {getWeekNumber()} of {new Date().getFullYear()}
              </span>
            </div>
          </div>
          
          {/* Division Selector */}
          <DivisionSelector 
            currentDivision={division}
          />
          
          {/* Leaderboard */}
          <DivisionLeaderboard userId={user.id} />
          
          {/* Week Progress */}
          <WeekProgress />
          
          {/* Coming Soon Section */}
          <div className="glass-card p-6 mt-8">
            <h3 className="text-lg font-bold mb-4">Coming Soon</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏅</span>
                <div>
                  <p className="font-semibold">Badge System</p>
                  <p className="text-sm text-gray-400">Earn achievements for your efforts</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl">👥</span>
                <div>
                  <p className="font-semibold">Custom Groups</p>
                  <p className="text-sm text-gray-400">Create private leaderboards</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎯</span>
                <div>
                  <p className="font-semibold">Challenges</p>
                  <p className="text-sm text-gray-400">Weekly and monthly competitions</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="font-semibold">Advanced Stats</p>
                  <p className="text-sm text-gray-400">Detailed progress tracking</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function getWeekNumber() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24 * 7))
}