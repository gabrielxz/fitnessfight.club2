import { createClient } from '@/lib/supabase/server'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'
import FAQContent from './FAQContent'

export default async function FAQPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <Navigation user={user} />
      <main className="relative z-10 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <FAQContent />
      </main>
    </div>
  )
}
