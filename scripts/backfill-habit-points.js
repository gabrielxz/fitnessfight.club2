// Backfill habit points for users under-counted by the old `position >= 5`
// eligibility bug. Recomputes expected points under the rank-based rule and
// applies the delta via increment_habit_points. Idempotent: a second run
// computes a ~0 delta and changes nothing.
// Run: node scripts/backfill-habit-points.js
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const AFFECTED = [
  '2fa01c2d-4ebc-45cd-b419-15e56fa1d10c', // Brian Clonaris
  '3754a386-b073-4479-a180-153ea8672ed4', // Amy Greene
  'c45868fa-b110-4b24-be25-034f44b037c2', // Vani Craven
  '6ff52889-f6b0-4403-8a48-3f7e4b2195ce', // Gabriel Beal
]

async function expectedFor(userId) {
  const { data: first5 } = await supabase
    .from('habits')
    .select('id, target_frequency')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(5)

  const ids = first5.map(h => h.id)
  const { data: entries } = await supabase
    .from('habit_entries')
    .select('habit_id, week_start, status')
    .in('habit_id', ids)
    .eq('status', 'SUCCESS')

  const byHabitWeek = new Map()
  for (const e of entries ?? []) {
    const k = `${e.habit_id}|${e.week_start}`
    byHabitWeek.set(k, (byHabitWeek.get(k) || 0) + 1)
  }
  let expected = 0
  const weeks = [...new Set((entries ?? []).map(e => e.week_start))]
  for (const wk of weeks) {
    for (const h of first5) {
      if ((byHabitWeek.get(`${h.id}|${wk}`) || 0) >= h.target_frequency) expected += 0.5
    }
  }
  return expected
}

async function main() {
  for (const userId of AFFECTED) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('cumulative_habit_points')
      .eq('id', userId).single()
    const actual = profile.cumulative_habit_points
    const expected = await expectedFor(userId)
    const delta = Math.round((expected - actual) * 2) / 2 // snap to 0.5

    if (Math.abs(delta) < 0.001) {
      console.log(`${userId}: already correct (${actual}) — no change`)
      continue
    }
    const { error } = await supabase.rpc('increment_habit_points', {
      p_user_id: userId,
      p_points_to_add: delta,
    })
    if (error) { console.error(`${userId}: RPC failed`, error); continue }

    const { data: after } = await supabase
      .from('user_profiles')
      .select('cumulative_habit_points')
      .eq('id', userId).single()
    console.log(`${userId}: ${actual} -> ${after.cumulative_habit_points}  (applied +${delta})`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
