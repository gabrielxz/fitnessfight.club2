import { createClient } from '@/lib/supabase/server'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <Navigation user={user} />
      
      <main className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl lg:text-6xl font-black mb-4">
              <span className="gradient-text">Hall of Champions</span>
            </h1>
            <p className="text-gray-400 text-lg mb-2">
              Celebrating our Fitness Fight Club legends
            </p>
            <div className="inline-flex items-center gap-2 mt-4">
              <span className="text-3xl">🏆</span>
              <span className="text-sm text-gray-300 uppercase tracking-wider">
                Past Season Winners
              </span>
              <span className="text-3xl">🏆</span>
            </div>
          </div>

          {/* Season 2 - Omar Farías */}
          <div className="mb-12 animate-fadeIn">
            <div className="glass-card p-8 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    Season 2 Champion
                  </h2>
                  <p className="text-2xl gradient-text font-bold">
                    Omar Farías
                  </p>
                </div>
                <div className="text-5xl">🥇</div>
              </div>
              
              <div className="relative aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-orange-900/20 to-yellow-900/20 border border-orange-500/20">
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-6xl mb-4 animate-pulse">🎭</div>
                  <h3 className="text-xl font-bold text-gray-300 mb-2">
                    Celebrity Congratulations Coming Soon!
                  </h3>
                  <p className="text-gray-400 text-center px-4">
                    A mystery celebrity is preparing a special message for our champion...
                  </p>
                  <div className="mt-4 px-4 py-2 glass-card">
                    <span className="text-orange-400 font-semibold">Stay tuned!</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Season 1 - Samantha Perlmutter */}
          <div className="mb-12 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
            <div className="glass-card p-8 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    Season 1 Champion
                  </h2>
                  <p className="text-2xl gradient-text font-bold">
                    Samantha Perlmutter
                  </p>
                </div>
                <div className="text-5xl">🥇</div>
              </div>
              
              <div className="mb-4">
                <p className="text-gray-300 mb-2">
                  Congratulations from <span className="font-semibold text-orange-400">Hidetoshi Imura</span>
                </p>
                <p className="text-sm text-gray-400 italic">
                  "The Surgeon" from The Office
                </p>
              </div>
              
              <div className="relative aspect-video rounded-xl overflow-hidden">
                <iframe
                  src="https://www.youtube.com/embed/2J97Ry-fwbQ"
                  title="Hidetoshi Imura congratulates Samantha Perlmutter"
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          </div>

          {/* Legacy Section */}
          <div className="text-center mt-16 mb-8">
            <div className="glass-card inline-block px-8 py-4 rounded-full">
              <p className="text-gray-300">
                Each season, we celebrate our champions with special messages from celebrities.
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Train hard. Earn points. Become a legend.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}