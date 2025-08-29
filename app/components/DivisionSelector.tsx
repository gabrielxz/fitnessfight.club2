'use client'

interface DivisionSelectorProps {
  currentDivision: {
    name: string
    level: number
    emoji?: string
  }
  onViewChange: (view: 'division' | 'global') => void
  activeView: 'division' | 'global'
}

const divisionEmojis: Record<string, string> = {
  'Noodle': '🍜',
  'Sweaty': '💦',
  'Shreddy': '💪',
  'Juicy': '🧃'
}

export default function DivisionSelector({ currentDivision, onViewChange, activeView }: DivisionSelectorProps) {
  const divisionEmoji = currentDivision.emoji || divisionEmojis[currentDivision.name] || '🏆'
  
  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-3xl shadow-lg">
            {divisionEmoji}
          </div>
          <div>
            <h2 className="text-2xl font-bold gradient-text">
              {currentDivision.name} Division
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Your competitive group • Top 1 advances • Bottom 1 drops
            </p>
          </div>
        </div>
        
        <div className="flex rounded-full p-1" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
          <button
            onClick={() => onViewChange('division')}
            className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
              activeView === 'division'
                ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            My Division
          </button>
          <button
            onClick={() => onViewChange('global')}
            className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
              activeView === 'global'
                ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Global
          </button>
        </div>
      </div>
    </div>
  )
}