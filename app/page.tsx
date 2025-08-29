import { createClient } from '@/lib/supabase/server'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'
import DivisionLeaderboard from './dashboard/DivisionLeaderboard'
import WeekProgress from './dashboard/WeekProgress'

export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch all divisions
  const { data: divisions } = await supabase
    .from('divisions')
    .select('*')
    .order('level', { ascending: true })

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
          
          {divisions?.map(division => (
            <div key={division.id} className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-4">{division.name} Division</h2>
              <DivisionLeaderboard userId={user?.id} divisionId={division.id} />
            </div>
          ))}

          <WeekProgress />
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