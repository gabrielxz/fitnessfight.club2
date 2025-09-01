import Image from 'next/image'

interface AthleteCardProps {
  rank: number
  name: string
  points: number
  hours: number
  zone: 'promotion' | 'safe' | 'relegation' | null
  isCurrentUser?: boolean
  badges?: Array<{ emoji: string; name?: string; tier: 'gold' | 'silver' | 'bronze' | string }>
  profilePicture?: string | null
}

export default function AthleteCard({
  rank,
  name,
  points,
  hours,
  zone,
  isCurrentUser = false,
  badges = [],
  profilePicture
}: AthleteCardProps) {
  const cardStyles: Record<number, React.CSSProperties> = {
    1: { 
      borderColor: 'rgba(234, 179, 8, 0.3)',
      background: 'linear-gradient(to bottom right, rgba(234, 179, 8, 0.05), transparent)'
    },
    2: { 
      borderColor: 'rgba(209, 213, 219, 0.3)',
      background: 'linear-gradient(to bottom right, rgba(209, 213, 219, 0.05), transparent)'
    },
    3: { 
      borderColor: 'rgba(234, 88, 12, 0.3)',
      background: 'linear-gradient(to bottom right, rgba(234, 88, 12, 0.05), transparent)'
    },
  }
  
  const rankEmojis: Record<number, string> = { 1: '🏆', 2: '🥈', 3: '🥉' }
  
  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  
  const mergedStyles = {
    ...cardStyles[rank],
    ...(isCurrentUser ? { boxShadow: '0 0 0 2px rgba(251, 146, 60, 0.5)' } : {})
  }
  
  return (
    <div className="glass-card p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl" style={mergedStyles}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          {profilePicture ? (
            <div className="relative w-12 h-12">
              <Image
                src={profilePicture}
                alt={name}
                fill
                className="rounded-full object-cover"
                sizes="48px"
              />
              {rank <= 3 && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                  {rank}
                </div>
              )}
            </div>
          ) : (
            <div className={`
              w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold
              ${rank <= 3 ? 'bg-gradient-to-br from-yellow-500 to-orange-500 text-white' : 'text-gray-300'}
            `} style={rank > 3 ? { backgroundColor: 'rgba(255, 255, 255, 0.1)' } : {}}>
              {rankEmojis[rank] || getInitials(name)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg">
                {isCurrentUser ? 'You' : name}
              </h3>
              {zone === 'promotion' && <span className="zone-promotion">↑ Promotion Zone</span>}
              {zone === 'relegation' && <span className="zone-relegation">↓ Danger Zone</span>}
              {zone === 'safe' && <span className="zone-safe">Safe Zone</span>}
            </div>
          </div>
        </div>
        <div className="text-3xl font-black" style={{ color: 'rgba(255, 255, 255, 0.2)' }}>
          #{rank}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
          <div className="text-2xl font-bold text-orange-500">{points.toFixed(2)}</div>
          <div className="text-xs text-gray-400 mt-1">Points</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
          <div className="text-2xl font-bold text-blue-400">{hours.toFixed(2)}h</div>
          <div className="text-xs text-gray-400 mt-1">This Week</div>
        </div>
      </div>
      
      {badges.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-2">Achievements</div>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge, idx) => (
              <div key={idx} className="relative group">
                <span className="text-2xl filter drop-shadow-lg transition-transform group-hover:scale-125">
                  {badge.emoji}
                </span>
                <div className={`
                  absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900
                  ${badge.tier === 'gold' ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : ''}
                  ${badge.tier === 'silver' ? 'bg-gradient-to-br from-gray-300 to-gray-500' : ''}
                  ${badge.tier === 'bronze' ? 'bg-gradient-to-br from-orange-600 to-orange-800' : ''}
                `} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}