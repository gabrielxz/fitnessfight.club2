'use client'

interface HabitWeekViewProps {
  habitId: string
  entries: Array<{
    date: string
    status: 'SUCCESS' | 'FAILURE' | 'NEUTRAL'
  }>
  weekStart: string
  currentDate: string
  onStatusChange: (habitId: string, date: string, status: 'SUCCESS' | 'FAILURE' | 'NEUTRAL') => void
}

export default function HabitWeekView({
  habitId,
  entries,
  weekStart,
  currentDate,
  onStatusChange
}: HabitWeekViewProps) {
  const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  
  // Calculate dates for the week (Monday to Sunday)
  const getWeekDates = () => {
    const dates = []
    const start = new Date(weekStart)
    
    // Week already starts on Monday, so just iterate through the 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      dates.push(date.toISOString().split('T')[0])
    }
    
    return dates
  }
  
  const weekDates = getWeekDates()
  
  // Get status for a specific date
  const getStatusForDate = (date: string) => {
    const entry = entries.find(e => e.date === date)
    // Only SUCCESS or NEUTRAL (no entry) - never FAILURE
    return entry?.status === 'SUCCESS' ? 'SUCCESS' : 'NEUTRAL'
  }
  
  // Toggle between SUCCESS and NEUTRAL only
  const toggleStatus = (currentStatus: string) => {
    return currentStatus === 'SUCCESS' ? 'NEUTRAL' : 'SUCCESS'
  }
  
  // Get color for status
  const getStatusColor = (status: string) => {
    return status === 'SUCCESS' ? 'bg-green-500' : 'bg-gray-600'
  }
  
  return (
    <div className="flex justify-between gap-2">
      {weekDates.map((date, index) => {
        const status = getStatusForDate(date)
        const isToday = date === currentDate
        const isPast = new Date(date) <= new Date(currentDate)
        
        return (
          <div key={date} className="flex flex-col items-center">
            <div className="text-xs text-gray-400 mb-2">{days[index]}</div>
            <button
              onClick={() => {
                if (isPast) {
                  const newStatus = toggleStatus(status) as 'SUCCESS' | 'NEUTRAL'
                  onStatusChange(habitId, date, newStatus)
                }
              }}
              disabled={!isPast}
              className={`
                w-10 h-10 rounded-full transition-all duration-200
                ${getStatusColor(status)}
                ${isPast ? 'hover:scale-110 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
                ${isToday ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-slate-900' : ''}
              `}
              title={isPast ? `Click to ${status === 'SUCCESS' ? 'unmark' : 'mark'} as complete` : 'Future date'}
            />
            {isToday && (
              <div className="text-[10px] text-yellow-500 mt-1 uppercase tracking-wider">Today</div>
            )}
          </div>
        )
      })}
    </div>
  )
}