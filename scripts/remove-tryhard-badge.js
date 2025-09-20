const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function removeTryhardBadge() {
  console.log('🗑️ Removing Tryhard badge and all related data...\n');

  try {
    // Step 1: Get the Tryhard badge ID
    console.log('1. Finding Tryhard badge...');
    const { data: badge, error: badgeError } = await supabase
      .from('badges')
      .select('id, name')
      .eq('code', 'tryhard')
      .single();

    if (badgeError) {
      if (badgeError.code === 'PGRST116') {
        console.log('  ✓ Tryhard badge not found (already removed)');
        return;
      }
      throw badgeError;
    }

    if (!badge) {
      console.log('  ✓ Tryhard badge not found (already removed)');
      return;
    }

    console.log(`  Found badge: ${badge.name} (ID: ${badge.id})`);

    // Step 2: Delete user badges for Tryhard
    console.log('\n2. Removing user badges for Tryhard...');
    const { data: userBadges, error: userBadgesError } = await supabase
      .from('user_badges')
      .delete()
      .eq('badge_id', badge.id)
      .select();

    if (userBadgesError) throw userBadgesError;
    console.log(`  ✓ Removed ${userBadges?.length || 0} user badges`);

    // Step 3: Delete badge progress for Tryhard
    console.log('\n3. Removing badge progress for Tryhard...');
    const { data: progressData, error: progressError } = await supabase
      .from('badge_progress')
      .delete()
      .eq('badge_id', badge.id)
      .select();

    if (progressError) throw progressError;
    console.log(`  ✓ Removed ${progressData?.length || 0} progress records`);

    // Step 4: Remove badge points that were awarded for Tryhard
    console.log('\n4. Removing Tryhard points from cumulative scores...');

    // Get all users who had the Tryhard badge
    if (userBadges && userBadges.length > 0) {
      for (const userBadge of userBadges) {
        const pointsToRemove = userBadge.points_awarded || 0;
        if (pointsToRemove > 0) {
          // Use RPC to decrement badge points
          const { error: rpcError } = await supabase.rpc('increment_badge_points', {
            p_user_id: userBadge.user_id,
            p_points_to_add: -pointsToRemove // Negative to subtract
          });

          if (rpcError) {
            console.error(`  ⚠️ Failed to remove points for user ${userBadge.user_id}:`, rpcError);
          } else {
            console.log(`  ✓ Removed ${pointsToRemove} points from user ${userBadge.user_id}`);
          }
        }
      }
    }

    // Step 5: Delete the badge definition
    console.log('\n5. Removing Tryhard badge definition...');
    const { error: deleteError } = await supabase
      .from('badges')
      .delete()
      .eq('id', badge.id);

    if (deleteError) throw deleteError;
    console.log('  ✓ Removed badge definition');

    console.log('\n✅ Successfully removed Tryhard badge and all related data!');

    // Note about suffer_score column
    console.log('\n📝 Note: The suffer_score column in strava_activities table has been kept');
    console.log('   as it contains historical data from Strava. It just won\'t be used for badges.');

  } catch (error) {
    console.error('\n❌ Error removing Tryhard badge:', error);
    process.exit(1);
  }
}

removeTryhardBadge();