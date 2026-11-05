import { createClient } from '@/lib/supabase/server'
import AnimatedBackground from '@/app/components/AnimatedBackground'
import Navigation from '@/app/components/Navigation'

interface Champion {
  season: number
  name: string
  youtubeId: string
  videoTitle: string
  from?: string
  fromDescription?: string
}

// Newest season first.
const CHAMPIONS: Champion[] = [
  {
    season: 4,
    name: 'Carri Hilliard',
    youtubeId: 'pkyaNr2k_ik',
    videoTitle: 'Congratulations to Carri Hilliard',
  },
  {
    season: 3,
    name: 'Brian Clonaris',
    youtubeId: 'cnvI2NPkL5Q',
    videoTitle: 'Tommy Chong congratulates Brian Clonaris',
    from: 'Tommy Chong',
    fromDescription: 'Comedy Legend & Star of “That ’70s Show”',
  },
  {
    season: 2,
    name: 'Omar Farías',
    youtubeId: 'HcUORb-xyXE',
    videoTitle: 'Jonathan Van Ness congratulates Omar Farías',
    from: 'Jonathan Van Ness',
    fromDescription: '“Queer Eye” Grooming Expert & Podcast Host',
  },
  {
    season: 1,
    name: 'Samantha Perlmutter',
    youtubeId: '2J97Ry-fwbQ',
    videoTitle: 'Hidetoshi Imura congratulates Samantha Perlmutter',
    from: 'Hidetoshi Imura',
    fromDescription: '“The Surgeon” from The Office',
  },
]

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

          {CHAMPIONS.map((champion, i) => (
            <div
              key={champion.season}
              className="mb-12 animate-fadeIn"
              style={i > 0 ? { animationDelay: `${i * 0.2}s` } : undefined}
            >
              <div className="glass-card p-8 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">
                      Season {champion.season} Champion
                    </h2>
                    <p className="text-2xl gradient-text font-bold">
                      {champion.name}
                    </p>
                  </div>
                  <div className="text-5xl">🥇</div>
                </div>

                {champion.from && (
                  <div className="mb-4">
                    <p className="text-gray-300 mb-2">
                      Congratulations from <span className="font-semibold text-orange-400">{champion.from}</span>
                    </p>
                    {champion.fromDescription && (
                      <p className="text-sm text-gray-400 italic">
                        {champion.fromDescription}
                      </p>
                    )}
                  </div>
                )}

                <div className="relative aspect-video rounded-xl overflow-hidden">
                  <iframe
                    src={`https://www.youtube.com/embed/${champion.youtubeId}`}
                    title={champion.videoTitle}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          ))}

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