// Read-only diagnostic for Ingrid Modaresi's habits & habit points.
// Run: node scripts/diagnose-ingrid-habits.js
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function findUser() {
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, cumulative_habit_points, cumulative_exercise_points, cumulative_badge_points, total_cumulative_points, timezone')
    .ilike('full_name', '%ingrid%')

  const { data: stravas } = await supabase
    .from('strava_connections')
    .select('user_id, strava_firstname, strava_lastname')
    .ilike('strava_firstname', '%ingrid%')

  console.log('profile matches:', JSON.stringify(profiles, null, 2))
  console.log('strava matches:', JSON.stringify(stravas, null, 2))
  if (profiles?.[0]) return profiles[0]
  // Fall back to the strava connection's user_id
  if (stravas?.[0]) {
    const { data: p } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, cumulative_habit_points, cumulative_exercise_points, cumulative_badge_points, total_cumulative_points, timezone')
      .eq('id', stravas[0].user_id)
      .single()
    console.log('profile by strava user_id:', JSON.stringify(p, null, 2))
    return p
  }
  return null
}

async function main() {
  const profile = await findUser()
  if (!profile) { console.log('No Ingrid found'); return }
  const userId = profile.id
  console.log(`\n==== Ingrid: ${userId} (${profile.full_name}, tz=${profile.timezone}) ====`)
  console.log(`cumulative_habit_points = ${profile.cumulative_habit_points}`)

  // ALL habits including archived
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, target_frequency, position, created_at, archived_at')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  console.log(`\n==== ALL habits (${habits?.length}) ====`)
  for (const h of habits ?? []) {
    console.log(`  pos=${h.position}  target=${h.target_frequency}  archived=${h.archived_at ? h.archived_at : 'NO (active)'}  created=${h.created_at}  "${h.name}"  id=${h.id}`)
  }

  // Active habits, ordered as the app does
  const active = (habits ?? []).filter(h => !h.archived_at)
  console.log(`\n==== ACTIVE habits in app order (${active.length}) ====`)
  active.forEach((h, i) => {
    const pointsEligibleByPosition = h.position < 5
    const inFirst5ByRank = i < 5
    const flag = pointsEligibleByPosition !== inFirst5ByRank ? '  <-- MISMATCH' : ''
    console.log(`  rank ${i} (${i < 5 ? 'first5' : 'BEYOND5'})  pos=${h.position}  pointsEligible(pos<5)=${pointsEligibleByPosition}  "${h.name}"${flag}`)
  })

  // Look specifically for "Lights out"
  const lights = (habits ?? []).filter(h => /lights? *out/i.test(h.name))
  console.log(`\n==== "Lights out" matches (${lights.length}) ====`)
  for (const h of lights) {
    console.log(`  pos=${h.position} archived=${h.archived_at || 'NO (ACTIVE!)'} "${h.name}" id=${h.id}`)
  }

  // Recompute expected habit points from entries.
  // Intended design: 0.5 per habit meeting its weekly target, first 5 habits only.
  // We compute two interpretations and compare.
  const allHabitIds = (habits ?? []).map(h => h.id)
  const { data: entries } = await supabase
    .from('habit_entries')
    .select('habit_id, week_start, status')
    .in('habit_id', allHabitIds)
    .eq('status', 'SUCCESS')

  // group successes by habit_id + week_start
  const byHabitWeek = new Map()
  for (const e of entries ?? []) {
    const k = `${e.habit_id}|${e.week_start}`
    byHabitWeek.set(k, (byHabitWeek.get(k) || 0) + 1)
  }

  const habitById = new Map((habits ?? []).map(h => [h.id, h]))
  // all weeks present
  const weeks = [...new Set((entries ?? []).map(e => e.week_start))].sort()

  // Interpretation A: points logic — habit.position < 5 (raw), regardless of archived
  // Interpretation B: badge logic — rank among CURRENTLY-active first 5
  // Interpretation C: rank among habits that were eligible that week is hard; we approximate
  //   "first 5 by position value < 5" which is what points logic effectively does.
  let totalA = 0
  const perWeek = []
  for (const wk of weeks) {
    let metA = 0
    const lines = []
    for (const h of habits ?? []) {
      const succ = byHabitWeek.get(`${h.id}|${wk}`) || 0
      if (succ === 0) continue
      const met = succ >= h.target_frequency
      const eligA = h.position < 5
      if (met && eligA) metA++
      lines.push(`      "${h.name}" pos=${h.position} succ=${succ}/${h.target_frequency} met=${met} eligPos<5=${eligA}`)
    }
    totalA += metA * 0.5
    perWeek.push({ wk, metA, lines })
  }

  console.log(`\n==== Expected habit points by week (Interpretation A: raw position<5, matches current points code) ====`)
  for (const w of perWeek) {
    console.log(`  week ${w.wk}: ${w.metA} habits met target -> ${(w.metA*0.5).toFixed(1)} pts`)
    for (const l of w.lines) console.log(l)
  }
  console.log(`\n  TOTAL expected (Interp A) = ${totalA.toFixed(1)} pts`)
  console.log(`  ACTUAL cumulative_habit_points = ${profile.cumulative_habit_points}`)
  console.log(`  DELTA (actual - expected) = ${(profile.cumulative_habit_points - totalA).toFixed(1)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
