import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BadgeProgressDisplay from './BadgeProgressDisplay'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen p-8 pt-24">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Your Stats
          </h1>
          <p className="text-gray-400">
            Track your progress towards earning badges
          </p>
        </div>

        <BadgeProgressDisplay />
      </div>
    </div>
  )
}