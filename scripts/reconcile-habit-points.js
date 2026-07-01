// One-time cleanup: delete pre-season habit entries and reconcile every user's
// cumulative_habit_points from the entries that remain.
//
// Mirrors the logic in lib/habits/reconcile.ts (first-5 active habits; a habit
// earns 0.5 per week it meets target_frequency).
//
//   node scripts/reconcile-habit-points.js            # DRY RUN (no writes)
//   node scripts/reconcile-habit-points.js --apply    # execute
//
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SEASON_START = '2026-04-06' // Season 4, Period 1 Monday. Entries in weeks before this are pre-season.
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

function firstFiveActive(list) {
  return list
    .filter(h => !h.archived_at)
    .sort((a, b) => ((a.position ?? 1e9) - (b.position ?? 1e9)) || (a.created_at < b.created_at ? -1 : 1))
    .slice(0, 5)
}

async function main() {
  console.log(APPLY ? '*** APPLY MODE — writing to prod ***\n' : '=== DRY RUN (no writes) ===\n')

  const profiles = await fetchAll('user_profiles', 'id, full_name, email, cumulative_habit_points')
  const habits = await fetchAll('habits', 'id, user_id, target_frequency, position, created_at, archived_at')
  const entries = await fetchAll('habit_entries', 'habit_id, week_start, status')

  const preSeason = entries.filter(e => e.week_start < SEASON_START)
  console.log(`Habit entries total: ${entries.length}`)
  console.log(`Pre-season entries (week_start < ${SEASON_START}) to DELETE: ${preSeason.length}\n`)

  // Recompute from the entries that will REMAIN (>= season start), first-5 active.
  const habitsByUser = new Map()
  for (const h of habits) {
    if (!habitsByUser.has(h.user_id)) habitsByUser.set(h.user_id, [])
    habitsByUser.get(h.user_id).push(h)
  }
  const successByHabitWeek = new Map() // habit_id -> Map(week_start -> count)
  for (const e of entries) {
    if (e.status !== 'SUCCESS') continue
    if (e.week_start < SEASON_START) continue // these rows are being deleted
    if (!successByHabitWeek.has(e.habit_id)) successByHabitWeek.set(e.habit_id, new Map())
    const m = successByHabitWeek.get(e.habit_id)
    m.set(e.week_start, (m.get(e.week_start) ?? 0) + 1)
  }

  const results = []
  for (const p of profiles) {
    const eligible = firstFiveActive(habitsByUser.get(p.id) ?? [])
    const weekMet = new Map()
    for (const h of eligible) {
      const wk = successByHabitWeek.get(h.id)
      if (!wk) continue
      for (const [week, cnt] of wk) {
        if (cnt >= h.target_frequency) weekMet.set(week, (weekMet.get(week) ?? 0) + 1)
      }
    }
    let points = 0
    for (const [, met] of weekMet) points += Math.min(met, 5) * 0.5
    const stored = p.cumulative_habit_points ?? 0
    results.push({ id: p.id, name: p.full_name || p.email, stored, points, delta: +(points - stored).toFixed(1) })
  }
  results.sort((a, b) => a.delta - b.delta)

  console.log('name'.padEnd(26), 'stored'.padStart(7), 'new'.padStart(7), 'delta'.padStart(7))
  console.log('-'.repeat(50))
  for (const r of results) {
    if (r.stored === 0 && r.points === 0) continue
    console.log(String(r.name).slice(0, 25).padEnd(26), r.stored.toFixed(1).padStart(7), r.points.toFixed(1).padStart(7), ((r.delta >= 0 ? '+' : '') + r.delta.toFixed(1)).padStart(7))
  }
  console.log('-'.repeat(50))
  const ts = results.reduce((s, r) => s + r.stored, 0)
  const tn = results.reduce((s, r) => s + r.points, 0)
  console.log(`TOTAL: ${ts.toFixed(1)} -> ${tn.toFixed(1)} (net ${(tn - ts).toFixed(1)})\n`)

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to delete pre-season entries and write the new totals.')
    return
  }

  // 1. Back up the full pre-season rows before deleting (recoverable insurance).
  const fs = require('fs')
  const path = require('path')
  const backupRows = await fetchAll('habit_entries', '*', q => q.lt('week_start', SEASON_START))
  const backupDir = path.join(__dirname, 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `pre-season-habit-entries-${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(backupRows, null, 2))
  console.log(`Backed up ${backupRows.length} pre-season entries to ${backupPath}`)

  // 2. Delete pre-season entries.
  const { error: delErr, count } = await supabase
    .from('habit_entries')
    .delete({ count: 'exact' })
    .lt('week_start', SEASON_START)
  if (delErr) throw new Error(`delete failed: ${delErr.message}`)
  console.log(`Deleted ${count} pre-season habit entries.`)

  // 3. Write reconciled totals.
  let updated = 0
  for (const r of results) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ cumulative_habit_points: r.points })
      .eq('id', r.id)
    if (error) throw new Error(`update ${r.name} failed: ${error.message}`)
    updated++
  }
  console.log(`Updated habit points for ${updated} users. Done.`)
}

main().catch(e => { console.error(e); process.exit(1) })
