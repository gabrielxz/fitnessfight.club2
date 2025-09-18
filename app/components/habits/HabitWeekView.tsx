'use client'

interface HabitWeekViewProps {
  habitId: string
  entries: Array<{
    date: string
    status: 'SUCCESS' | 'FAILURE' | 'NEUTRAL'
  }>
  weekStart: string
  currentDate: string
  pendingUpdates?: Set<string>
  onStatusChange: (habitId: string, date: string, status: 'SUCCESS' | 'FAILURE' | 'NEUTRAL') => void
}

export default function HabitWeekView({
  habitId,
  entries,
  weekStart,
  currentDate,
  pendingUpdates,
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
    return entry?.status || 'NEUTRAL'
  }
  
  // Cycle through statuses: NEUTRAL -> SUCCESS -> FAILURE -> NEUTRAL
  const cycleStatus = (currentStatus: string) => {
    const cycle = ['NEUTRAL', 'SUCCESS', 'FAILURE']
    const currentIndex = cycle.indexOf(currentStatus)
    return cycle[(currentIndex + 1) % cycle.length] as 'SUCCESS' | 'FAILURE' | 'NEUTRAL'
  }
  
  // Get color for status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-500'
      case 'FAILURE':
        return 'bg-red-500'
      case 'NEUTRAL':
      default:
        return 'bg-gray-600'
    }
  }
  
  // Get tooltip for status
  const getStatusTooltip = (status: string, isPast: boolean) => {
    if (!isPast) return 'Future date'
    switch (status) {
      case 'SUCCESS':
        return 'Completed (click to mark as failed)'
      case 'FAILURE':
        return 'Failed (click to clear)'
      case 'NEUTRAL':
      default:
        return 'Not tracked (click to mark complete)'
    }
  }
  
  return (
    <div className="flex justify-between gap-2">
      {weekDates.map((date, index) => {
        const status = getStatusForDate(date)
        const isToday = date === currentDate
        const isPast = new Date(date) <= new Date(currentDate)
        const updateKey = `${habitId}-${date}`
        const isPending = pendingUpdates?.has(updateKey) || false

        return (
          <div key={date} className="flex flex-col items-center">
            <div className="text-xs text-gray-400 mb-2">{days[index]}</div>
            <button
              onClick={() => {
                if (isPast && !isPending) {
                  const newStatus = cycleStatus(status)
                  onStatusChange(habitId, date, newStatus)
                }
              }}
              disabled={!isPast || isPending}
              className={`
                w-10 h-10 rounded-full transition-all duration-200 relative
                ${getStatusColor(status)}
                ${isPast && !isPending ? 'hover:scale-110 cursor-pointer' : ''}
                ${!isPast ? 'opacity-50 cursor-not-allowed' : ''}
                ${isPending ? 'opacity-75' : ''}
                ${isToday ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-slate-900' : ''}
              `}
              title={isPending ? 'Updating...' : getStatusTooltip(status, isPast)}
            >
              {isPending && (
                <div className="absolute inset-0 rounded-full animate-pulse bg-white/20" />
              )}
            </button>
            {isToday && (
              <div className="text-[10px] text-yellow-500 mt-1 uppercase tracking-wider">Today</div>
            )}
          </div>
        )
      })}
    </div>
  )
}