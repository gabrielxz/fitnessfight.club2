interface Badge {
  emoji: string
  name: string
  tier: 'bronze' | 'silver' | 'gold'
}

interface BadgeDisplayProps {
  badges: Badge[]
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export default function BadgeDisplay({ 
  badges, 
  size = 'md', 
  showLabel = false 
}: BadgeDisplayProps) {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl'
  }
  
  const tierColors = {
    gold: 'from-yellow-400 to-yellow-600',
    silver: 'from-gray-300 to-gray-500',
    bronze: 'from-amber-600 to-amber-800'
  }
  
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge, idx) => (
        <div key={idx} className="relative group">
          <div className="relative">
            <span className={`${sizeClasses[size]} filter drop-shadow-lg transition-transform group-hover:scale-125`}>
              {badge.emoji}
            </span>
            <div className={`
              absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900
              bg-gradient-to-br ${tierColors[badge.tier]}
            `} />
          </div>
          {showLabel && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                          opacity-0 group-hover:opacity-100 transition-opacity
                          bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
              {badge.name} ({badge.tier})
            </div>
          )}
        </div>
      ))}
    </div>
  )
}