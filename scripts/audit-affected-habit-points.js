// Read-only: for users affected by the position/rank divergence, recompute
// expected habit points under the CORRECT rank-based rule (first 5 active
// habits) and compare to stored cumulative_habit_points.
// Run: node scripts/audit-affected-habit-points.js
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const AFFECTED = [
  '2fa01c2d-4ebc-45cd-b419-15e56fa1d10c',
  '3754a386-b073-4479-a180-153ea8672ed4',
  'c45868fa-b110-4b24-be25-034f44b037c2',
  '6ff52889-f6b0-4403-8a48-3f7e4b2195ce',
]

async function audit(userId) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('cumulative_habit_points')
    .eq('id', userId).single()
  const { data: strava } = await supabase
    .from('strava_connections')
    .select('strava_firstname, strava_lastname')
    .eq('user_id', userId).maybeSingle()
  const name = strava ? `${strava.strava_firstname}${strava.strava_lastname}`.trim() : '(no strava)'

  // First 5 active habits by rank (the correct eligible set)
  const { data: first5 } = await supabase
    .from('habits')
    .select('id, name, target_frequency')
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
  const weeks = [...new Set((entries ?? []).map(e => e.week_start))].sort()
  for (const wk of weeks) {
    for (const h of first5) {
      const succ = byHabitWeek.get(`${h.id}|${wk}`) || 0
      if (succ >= h.target_frequency) expected += 0.5
    }
  }

  const actual = profile.cumulative_habit_points
  console.log(`\n${name}  (${userId})`)
  console.log(`  first-5 habits: ${first5.map(h => h.name).join(' | ')}`)
  console.log(`  actual cumulative_habit_points = ${actual}`)
  console.log(`  expected under rank rule        = ${expected.toFixed(1)}`)
  console.log(`  OWED (expected - actual)        = ${(expected - actual).toFixed(1)}`)
}

async function main() {
  for (const u of AFFECTED) await audit(u)
}
main().catch(e => { console.error(e); process.exit(1) })
