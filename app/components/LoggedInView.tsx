'use client'

import { useState } from 'react'
import DivisionSelector from './DivisionSelector'
import DivisionLeaderboard from './DivisionLeaderboard'
import WeekProgress from './WeekProgress'

interface Division {
  id: string
  name: string
  level: number
  emoji?: string
}

interface LoggedInViewProps {
  userId: string
  userDivision: Division | null
  allDivisions: Division[]
}

const divisionEmojis: Record<string, string> = {
  'Noodle': '🍜',
  'Sweaty': '💦',
  'Shreddy': '💪',
  'Juicy': '🧃'
}

export default function LoggedInView({ userId, userDivision, allDivisions }: LoggedInViewProps) {
  const [activeView, setActiveView] = useState<'division' | 'global'>(userDivision ? 'division' : 'global')
  
  return (
    <>
      {userDivision ? (
        <DivisionSelector 
          currentDivision={userDivision}
          onViewChange={setActiveView}
          activeView={activeView}
        />
      ) : (
        <div className="glass-card p-4 text-center mb-8">
          <p className="text-gray-300">You are not currently in a division. Explore the global leaderboards below.</p>
        </div>
      )}
      
      {/* Show content based on toggle */}
      {activeView === 'division' && userDivision ? (
        <>
          {/* Single division leaderboard */}
          <DivisionLeaderboard userId={userId} />
        </>
      ) : (
        <>
          {/* All divisions */}
          {allDivisions?.map(division => (
            <div key={division.id} className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-4">
                <span className="mr-2">{divisionEmojis[division.name] || '🏆'}</span>
                {division.name} Division
              </h2>
              <DivisionLeaderboard userId={userId} divisionId={division.id} />
            </div>
          ))}
        </>
      )}
      
      {/* Week Progress */}
      <WeekProgress />
    </>
  )
}