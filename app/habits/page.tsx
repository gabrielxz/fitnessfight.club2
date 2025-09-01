import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HabitList from '@/app/components/habits/HabitList'

export default async function HabitsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-yellow-500">
            My Habits
          </h1>
          <HabitList />
        </div>
      </div>
    </div>
  )
}