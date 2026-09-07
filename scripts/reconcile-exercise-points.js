// One-time reconcile of cumulative_exercise_points from weekly tracking rows.
// Heals orphaned points left by the per-week diff logic when activities/tracking
// rows were removed out-of-band. No rows are deleted — only the counter is fixed.
// Mirrors reconcileExercisePointsForUser in lib/points-helpers.ts.
//
//   node scripts/reconcile-exercise-points.js            # DRY RUN (no writes)
//   node scripts/reconcile-exercise-points.js --apply    # execute
//
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const APPLY = process.argv.includes('--apply')

async function fetchAll(table, cols, filter) {
  let all = [], from = 0
  const size = 1000
  for (;;) {
    let q = supabase.from(table).select(cols).range(from, from + size - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    all = all.concat(data)
    if (data.length < size) break
    from += size
  }
  return all
}

async function main() {
  console.log(APPLY ? '*** APPLY MODE — writing to prod ***\n' : '=== DRY RUN (no writes) ===\n')

  const profiles = await fetchAll('user_profiles', 'id, full_name, email, cumulative_exercise_points')
  const tracking = await fetchAll('weekly_exercise_tracking', 'user_id, hours_logged')

  const cappedByUser = new Map()
  for (const t of tracking) {
    cappedByUser.set(t.user_id, (cappedByUser.get(t.user_id) ?? 0) + Math.min(t.hours_logged ?? 0, 9))
  }

  const results = profiles.map(p => {
    const stored = p.cumulative_exercise_points ?? 0
    const points = +(cappedByUser.get(p.id) ?? 0).toFixed(4)
    return { id: p.id, name: p.full_name || p.email, stored, points, delta: +(points - stored).toFixed(2) }
  }).filter(r => Math.abs(r.delta) > 0.01).sort((a, b) => a.delta - b.delta)

  if (results.length === 0) {
    console.log('No drift found — all users already reconciled.')
    return
  }

  console.log('name'.padEnd(26), 'stored'.padStart(9), 'new'.padStart(9), 'delta'.padStart(8))
  console.log('-'.repeat(54))
  for (const r of results) {
    console.log(String(r.name).slice(0, 25).padEnd(26), r.stored.toFixed(2).padStart(9), r.points.toFixed(2).padStart(9), ((r.delta >= 0 ? '+' : '') + r.delta.toFixed(2)).padStart(8))
  }
  console.log('-'.repeat(54))
  console.log(`${results.length} users to correct; net ${results.reduce((s, r) => s + r.delta, 0).toFixed(2)}\n`)

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to write the corrected totals.')
    return
  }

  let updated = 0
  for (const r of results) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ cumulative_exercise_points: r.points })
      .eq('id', r.id)
    if (error) throw new Error(`update ${r.name} failed: ${error.message}`)
    updated++
  }
  console.log(`Corrected exercise points for ${updated} users. Done.`)
}

main().catch(e => { console.error(e); process.exit(1) })
