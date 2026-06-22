// Read-only: scan all users for divergence between the two "first 5" definitions.
//   Points logic (entries route): eligible iff raw habit.position < 5
//   Badge logic (BadgeCalculator): eligible iff rank < 5 among active habits ordered by position, created_at
// Reports any user where the set of point-eligible habits != set of first-5-by-rank habits.
// Run: node scripts/scan-habit-position-gaps.js
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data: habits } = await supabase
    .from('habits')
    .select('id, user_id, name, position, archived_at, created_at')
    .is('archived_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  const byUser = new Map()
  for (const h of habits ?? []) {
    if (!byUser.has(h.user_id)) byUser.set(h.user_id, [])
    byUser.get(h.user_id).push(h)
  }

  let affected = 0
  for (const [userId, list] of byUser) {
    // list is already sorted by position, created_at
    const first5ByRank = new Set(list.slice(0, 5).map(h => h.id))
    const eligByPosition = new Set(list.filter(h => h.position < 5).map(h => h.id))

    const onlyRank = list.slice(0, 5).filter(h => !eligByPosition.has(h.id))   // in first-5 but points logic skips (UNDERCOUNT)
    const onlyPos = list.filter(h => h.position < 5 && !first5ByRank.has(h.id)) // points logic counts but not in first-5 (impossible normally)

    if (onlyRank.length || onlyPos.length) {
      affected++
      console.log(`\nUSER ${userId}  (${list.length} active habits)`)
      console.log('  positions:', list.map(h => h.position).join(','))
      for (const h of onlyRank) console.log(`  UNDERCOUNT: "${h.name}" pos=${h.position} is in first-5-by-rank but points logic skips it (pos>=5)`)
      for (const h of onlyPos) console.log(`  OVERCOUNT?: "${h.name}" pos=${h.position} counted by points but not in first-5-by-rank`)
    }
  }

  console.log(`\n==== ${byUser.size} users with active habits; ${affected} affected by position/rank divergence ====`)

  // Also: any user with >5 active habits (where the cap matters at all)
  const manyHabits = [...byUser.entries()].filter(([, l]) => l.length > 5)
  console.log(`\nUsers with >5 active habits (${manyHabits.length}):`)
  for (const [uid, l] of manyHabits) {
    console.log(`  ${uid}: ${l.length} habits, positions ${l.map(h => h.position).join(',')}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
