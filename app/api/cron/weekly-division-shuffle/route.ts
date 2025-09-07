import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper functions for week calculations
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  // If Sunday (0), treat as end of week (day 7)
  const adjustedDay = day === 0 ? 7 : day
  // Calculate days back to Monday (1)
  const diff = d.getUTCDate() - (adjustedDay - 1)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart)
  end.setUTCDate(end.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return end
}

export async function GET(request: NextRequest) {
  try {
    // Verify this is called by Vercel Cron
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('Unauthorized cron attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('Starting weekly division shuffle...')
    const supabase = await createClient()
    
    // Calculate last week's dates
    const now = new Date()
    const weekStart = getWeekStart(now)
    weekStart.setDate(weekStart.getDate() - 7) // Last week
    const weekEnd = getWeekEnd(weekStart)
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]
    
    // Get all divisions ordered by level
    const { data: divisions, error: divError } = await supabase
      .from('divisions')
      .select('*')
      .order('level', { ascending: true })
    
    if (divError || !divisions) {
      console.error('Error fetching divisions:', divError)
      return NextResponse.json({ error: 'Failed to fetch divisions' }, { status: 500 })
    }
    
    interface DivisionChange {
      user_id: string
      from_division_id: string
      to_division_id: string
      from_division_name: string
      to_division_name: string
      final_points: number
      final_position: number
    }
    
    const promotions: DivisionChange[] = []
    const relegations: DivisionChange[] = []
    
    // Process each division
    for (const division of divisions) {
      // Get all users in this division
      const { data: divisionUsers } = await supabase
        .from('user_divisions')
        .select('user_id')
        .eq('division_id', division.id)
      
      if (!divisionUsers || divisionUsers.length === 0) {
        console.log(`No users in ${division.name} division`)
        continue
      }
      
      const userIds = divisionUsers.map(u => u.user_id)
      
      // Get points for last week
      const { data: userPoints } = await supabase
        .from('user_points')
        .select('user_id, total_points')
        .in('user_id', userIds)
        .eq('week_start', weekStartStr)
        .order('total_points', { ascending: false })
      
      if (!userPoints || userPoints.length === 0) {
        console.log(`No points data for ${division.name} division`)
        continue
      }
      
      // Determine promotions and relegations
      // Promote top user (if not in Juicy division and division has more than 1 user)
      if (division.level < 4 && userPoints.length > 1) {
        const topUser = userPoints[0]
        const nextDivision = divisions.find(d => d.level === division.level + 1)
        
        if (nextDivision) {
          promotions.push({
            user_id: topUser.user_id,
            from_division_id: division.id,
            to_division_id: nextDivision.id,
            from_division_name: division.name,
            to_division_name: nextDivision.name,
            final_points: topUser.total_points,
            final_position: 1
          })
        }
      }
      
      // Relegate bottom user (if not in Noodle division and division has more than 1 user)
      if (division.level > 1 && userPoints.length > 1) {
        const bottomUser = userPoints[userPoints.length - 1]
        const prevDivision = divisions.find(d => d.level === division.level - 1)
        
        if (prevDivision) {
          relegations.push({
            user_id: bottomUser.user_id,
            from_division_id: division.id,
            to_division_id: prevDivision.id,
            from_division_name: division.name,
            to_division_name: prevDivision.name,
            final_points: bottomUser.total_points,
            final_position: userPoints.length
          })
        }
      }
    }
    
    // Apply all promotions
    for (const promotion of promotions) {
      // Update user division
      await supabase
        .from('user_divisions')
        .update({ 
          division_id: promotion.to_division_id,
          joined_division_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', promotion.user_id)
      
      // Log to division history
      await supabase
        .from('division_history')
        .insert({
          user_id: promotion.user_id,
          from_division_id: promotion.from_division_id,
          to_division_id: promotion.to_division_id,
          change_type: 'promotion',
          week_start: weekStartStr,
          week_end: weekEndStr,
          final_points: promotion.final_points,
          final_position: promotion.final_position
        })
      
      console.log(`Promoted user ${promotion.user_id} from ${promotion.from_division_name} to ${promotion.to_division_name}`)
    }
    
    // Apply all relegations
    for (const relegation of relegations) {
      // Update user division
      await supabase
        .from('user_divisions')
        .update({ 
          division_id: relegation.to_division_id,
          joined_division_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', relegation.user_id)
      
      // Log to division history
      await supabase
        .from('division_history')
        .insert({
          user_id: relegation.user_id,
          from_division_id: relegation.from_division_id,
          to_division_id: relegation.to_division_id,
          change_type: 'relegation',
          week_start: weekStartStr,
          week_end: weekEndStr,
          final_points: relegation.final_points,
          final_position: relegation.final_position
        })
      
      console.log(`Relegated user ${relegation.user_id} from ${relegation.from_division_name} to ${relegation.to_division_name}`)
    }
    
    // Reset weekly badge progress
    console.log('Resetting weekly badge progress...')
    
    // Get all badges with weekly reset period
    const { data: weeklyBadges } = await supabase
      .from('badges')
      .select('id')
      .eq('active', true)
      .eq('criteria->reset_period', 'weekly')
    
    if (weeklyBadges && weeklyBadges.length > 0) {
      const badgeIds = weeklyBadges.map(b => b.id)
      
      // Archive old weekly progress by updating last_reset_at
      await supabase
        .from('badge_progress')
        .update({ 
          last_reset_at: new Date().toISOString()
        })
        .in('badge_id', badgeIds)
        .lt('period_end', now.toISOString())
      
      console.log(`Reset progress for ${weeklyBadges.length} weekly badges`)
    }
    
    // Calculate habit points for the week
    console.log('Calculating habit points...')
    
    // Get all users' habits for this week
    const { data: allHabits } = await supabase
      .from('habits')
      .select('id, user_id, position')
      .is('archived_at', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    
    if (allHabits && allHabits.length > 0) {
      // Group habits by user and keep only first 5
      const userHabitsMap = new Map<string, string[]>()
      
      for (const habit of allHabits) {
        const userHabits = userHabitsMap.get(habit.user_id) || []
        if (userHabits.length < 5) {
          userHabits.push(habit.id)
        }
        userHabitsMap.set(habit.user_id, userHabits)
      }
      
      // Get summaries for the eligible habits
      const eligibleHabitIds = Array.from(userHabitsMap.values()).flat()
      
      const { data: habitsWithSummaries } = await supabase
        .from('habit_weekly_summaries')
        .select('*')
        .eq('week_start', weekStartStr)
        .in('habit_id', eligibleHabitIds)
      
      if (habitsWithSummaries && habitsWithSummaries.length > 0) {
        // Group by user and calculate points
        const userHabitPoints = new Map<string, number>()
        
        for (const summary of habitsWithSummaries) {
          // Award 0.5 points per habit that met its weekly target
          if (summary.successes >= summary.target) {
            const currentPoints = userHabitPoints.get(summary.user_id) || 0
            userHabitPoints.set(summary.user_id, currentPoints + 0.5)
            
            // Update the summary with points earned
            await supabase
              .from('habit_weekly_summaries')
              .update({ points_earned: 0.5 })
              .eq('id', summary.id)
          }
        }
      
      // Add habit points to user_points
      for (const [userId, habitPoints] of userHabitPoints) {
        // Get existing points for this week
        const { data: existingPoints } = await supabase
          .from('user_points')
          .select('*')
          .eq('user_id', userId)
          .eq('week_start', weekStartStr)
          .single()
        
        if (existingPoints) {
          // Update existing points (add habit points)
          await supabase
            .from('user_points')
            .update({ 
              total_points: existingPoints.total_points + habitPoints,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingPoints.id)
        } else {
          // Create new points record (shouldn't happen usually)
          await supabase
            .from('user_points')
            .insert({
              user_id: userId,
              week_start: weekStartStr,
              week_end: weekEndStr,
              total_points: habitPoints,
              total_hours: 0,
              activity_count: 0
            })
        }
        
        console.log(`Added ${habitPoints} habit points for user ${userId}`)
      }
        
        console.log(`Calculated habit points for ${userHabitPoints.size} users`)
      }
    }
    
    console.log('Weekly division shuffle, badge reset, and habit points calculation completed')
    
    return NextResponse.json({ 
      success: true, 
      shuffled: new Date().toISOString(),
      promotions: promotions.length,
      relegations: relegations.length,
      weekProcessed: weekStartStr,
      badgesReset: weeklyBadges?.length || 0
    })
  } catch (error) {
    console.error('Error in weekly division shuffle:', error)
    return NextResponse.json({ error: 'Division shuffle failed' }, { status: 500 })
  }
}