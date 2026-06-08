/**
 * Fix: Mile Collector badge was excluding Hike activities.
 *
 * 1. Updates the badge definition's activity_types to:
 *      Walk, Run, TrailRun, VirtualRun, Hike   (was: ...+ Treadmill, no Hike)
 * 2. Recalculates the cumulative mile_collector total for every user and
 *    upgrades tiers / awards badge points where the new total crosses a
 *    threshold. Mirrors BadgeCalculator.awardBadge() exactly: same tier
 *    point values (3/6/15), same "only upgrade, pay the delta" guard, and
 *    the same increment_badge_points RPC so cumulative_badge_points stays
 *    in sync. Re-running is idempotent.
 *
 * Usage:
 *   node scripts/fix-mile-collector-include-hike.js            # DRY RUN (no writes)
 *   node scripts/fix-mile-collector-include-hike.js --apply    # apply changes
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APPLY = process.argv.includes('--apply');
const ACTIVITY_TYPES = ['Walk', 'Run', 'TrailRun', 'VirtualRun', 'Hike'];
const TIER_POINTS = { bronze: 3, silver: 6, gold: 15 };
const TIER_ORDER = { bronze: 1, silver: 2, gold: 3 };

function tierFor(value, criteria) {
  if (value >= criteria.gold) return 'gold';
  if (value >= criteria.silver) return 'silver';
  if (value >= criteria.bronze) return 'bronze';
  return null;
}

async function main() {
  console.log(`\n=== Mile Collector / Hike fix — ${APPLY ? 'APPLY' : 'DRY RUN'} ===\n`);

  const { data: badge, error: badgeErr } = await supabase
    .from('badges').select('*').eq('code', 'mile_collector').single();
  if (badgeErr || !badge) { console.error('Could not load badge:', badgeErr); process.exit(1); }

  // --- Step 1: badge definition ---
  const newCriteria = { ...badge.criteria, activity_types: ACTIVITY_TYPES };
  console.log('activity_types:', JSON.stringify(badge.criteria.activity_types), '->', JSON.stringify(ACTIVITY_TYPES));
  if (APPLY) {
    const { error } = await supabase.from('badges').update({ criteria: newCriteria }).eq('id', badge.id);
    if (error) { console.error('Failed updating badge:', error); process.exit(1); }
    console.log('  badge definition updated.\n');
  } else {
    console.log('  (dry run — definition not written)\n');
  }
  const criteria = newCriteria;

  // --- Step 2: recalc per user ---
  const { data: users } = await supabase.from('user_profiles').select('id, full_name');
  let changed = 0;

  for (const user of users || []) {
    const typeConds = ACTIVITY_TYPES.map(t => `type.eq.${t}`).join(',');
    const sportConds = ACTIVITY_TYPES.map(t => `sport_type.eq.${t}`).join(',');
    const { data: acts } = await supabase
      .from('strava_activities')
      .select('distance')
      .eq('user_id', user.id)
      .or(`${typeConds},${sportConds}`)
      .is('deleted_at', null);

    const miles = (acts || []).reduce((s, a) => s + (a.distance || 0) / 1609.34, 0);
    const newTier = tierFor(miles, criteria);

    const { data: existingBadge } = await supabase
      .from('user_badges').select('*').eq('user_id', user.id).eq('badge_id', badge.id).maybeSingle();
    const existingTier = existingBadge?.tier || null;

    const upgrades = newTier && (!existingTier || TIER_ORDER[newTier] > TIER_ORDER[existingTier]);
    if (upgrades) {
      changed++;
      const pointsDelta = TIER_POINTS[newTier] - (existingBadge?.points_awarded || 0);
      console.log(`  ${user.full_name || user.id}: ${miles.toFixed(1)} mi -> ${existingTier || 'none'} → ${newTier} (+${pointsDelta} pts)`);
    }

    if (!APPLY) continue;

    // Upsert badge_progress (cumulative => period_start NULL)
    const progress = {
      user_id: user.id, badge_id: badge.id, current_value: miles,
      bronze_achieved: miles >= criteria.bronze,
      silver_achieved: miles >= criteria.silver,
      gold_achieved: miles >= criteria.gold,
      period_start: null, period_end: null, last_updated: new Date().toISOString(),
    };
    const { data: existingProg } = await supabase
      .from('badge_progress').select('id').eq('user_id', user.id).eq('badge_id', badge.id).is('period_start', null).maybeSingle();
    if (existingProg) await supabase.from('badge_progress').update(progress).eq('id', existingProg.id);
    else await supabase.from('badge_progress').insert(progress);

    if (!upgrades) continue;

    const pointsDelta = TIER_POINTS[newTier] - (existingBadge?.points_awarded || 0);
    if (existingBadge) {
      await supabase.from('user_badges')
        .update({ tier: newTier, progress_value: miles, points_awarded: TIER_POINTS[newTier] })
        .eq('id', existingBadge.id);
    } else {
      await supabase.from('user_badges')
        .insert({ user_id: user.id, badge_id: badge.id, tier: newTier, progress_value: miles, points_awarded: TIER_POINTS[newTier] });
    }
    if (pointsDelta > 0) {
      const { error: rpcErr } = await supabase.rpc('increment_badge_points', { p_user_id: user.id, p_points_to_add: pointsDelta });
      if (rpcErr) console.error(`    ! RPC error for ${user.id}:`, rpcErr.message);
    }
  }

  console.log(`\n${changed} user(s) with a tier change.${APPLY ? '' : '  Re-run with --apply to write.'}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
