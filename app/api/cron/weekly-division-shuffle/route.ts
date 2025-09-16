import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Helper to get the start of the *previous* week (Monday)
function getLastWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const adjustedDay = day === 0 ? 7 : day
  const diff = d.getUTCDate() - (adjustedDay - 1) - 7 // Go back 7 more days for last week
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0))
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('Starting weekly division shuffle based on cumulative points...')
    const supabase = createAdminClient()
    
    const now = new Date()
    const lastWeekStart = getLastWeekStart(now)
    const lastWeekEnd = new Date(lastWeekStart)
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6)
    lastWeekEnd.setUTCHours(23, 59, 59, 999)

    const weekStartStr = lastWeekStart.toISOString().split('T')[0]
    const weekEndStr = lastWeekEnd.toISOString().split('T')[0]
    
    const { data: divisions, error: divError } = await supabase
      .from('divisions')
      .select('*')
      .order('level', { ascending: true })
    
    if (divError || !divisions) {
      console.error('Error fetching divisions:', divError)
      throw divError
    }
    
    const promotions: any[] = []
    const relegations: any[] = []
    
    for (const division of divisions) {
      const { data: divisionUsers } = await supabase
        .from('user_divisions')
        .select('user_id')
        .eq('division_id', division.id)
      
      if (!divisionUsers || divisionUsers.length === 0) continue
      
      const userIds = divisionUsers.map(u => u.user_id)
      
      // Get cumulative points for all users in the division
      const { data: userProfiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, total_cumulative_points')
        .in('id', userIds)
        .order('total_cumulative_points', { ascending: false })

      if (profileError) throw profileError
      if (!userProfiles || userProfiles.length === 0) continue

      // Promote top user (if not in Juicy and division has > 1 user)
      if (division.level < 4 && userProfiles.length > 1) {
        const topUser = userProfiles[0]
        const nextDivision = divisions.find(d => d.level === division.level + 1)
        if (nextDivision) {
          promotions.push({
            user_id: topUser.id,
            from_division_id: division.id,
            to_division_id: nextDivision.id,
            from_division_name: division.name,
            to_division_name: nextDivision.name,
            final_points: topUser.total_cumulative_points,
            final_position: 1
          })
        }
      }
      
      // Relegate bottom user (if not in Noodle and division has > 1 user)
      if (division.level > 1 && userProfiles.length > 1) {
        const bottomUser = userProfiles[userProfiles.length - 1]
        const prevDivision = divisions.find(d => d.level === division.level - 1)
        if (prevDivision) {
          relegations.push({
            user_id: bottomUser.id,
            from_division_id: division.id,
            to_division_id: prevDivision.id,
            from_division_name: division.name,
            to_division_name: prevDivision.name,
            final_points: bottomUser.total_cumulative_points,
            final_position: userProfiles.length
          })
        }
      }
    }
    
    // Apply promotions and relegations
    const allChanges = [...promotions, ...relegations]
    for (const change of allChanges) {
      await supabase
        .from('user_divisions')
        .update({ division_id: change.to_division_id, updated_at: new Date().toISOString() })
        .eq('user_id', change.user_id)
      
      await supabase
        .from('division_history')
        .insert({
          user_id: change.user_id,
          from_division_id: change.from_division_id,
          to_division_id: change.to_division_id,
          change_type: promotions.includes(change) ? 'promotion' : 'relegation',
          week_start: weekStartStr,
          week_end: weekEndStr,
          final_points: change.final_points,
          final_position: change.final_position
        })
      console.log(`${promotions.includes(change) ? 'Promoted' : 'Relegated'} user ${change.user_id} from ${change.from_division_name} to ${change.to_division_name}`)
    }
    
    // Reset weekly badge progress
    const { data: weeklyBadges } = await supabase
      .from('badges')
      .select('id')
      .eq('active', true)
      .eq('criteria->reset_period', 'weekly')
    
    if (weeklyBadges && weeklyBadges.length > 0) {
      const badgeIds = weeklyBadges.map(b => b.id)
      await supabase
        .from('badge_progress')
        .update({ last_reset_at: new Date().toISOString() })
        .in('badge_id', badgeIds)
        .lt('period_end', now.toISOString())
      console.log(`Reset progress for ${weeklyBadges.length} weekly badges`)
    }
    
    console.log('Weekly division shuffle and badge reset completed')
    
    return NextResponse.json({ 
      success: true, 
      promotions: promotions.length,
      relegations: relegations.length,
    })
  } catch (error) {
    console.error('Error in weekly division shuffle:', error)
    return NextResponse.json({ error: 'Division shuffle failed' }, { status: 500 })
  }
}
