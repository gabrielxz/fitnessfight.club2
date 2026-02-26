import { createClient } from '@/lib/supabase/server'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'
import RivalriesView from './RivalriesView'

export default async function RivalriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <Navigation user={user} />
      <main className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <RivalriesView />
        </div>
      </main>
    </div>
  )
}
