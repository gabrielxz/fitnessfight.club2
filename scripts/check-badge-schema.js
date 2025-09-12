const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
  console.log('Checking badge_progress table schema...\n');

  // Try to query with period columns
  console.log('Testing period_start column...');
  const { data: test1, error: error1 } = await supabase
    .from('badge_progress')
    .select('period_start')
    .limit(1);

  if (error1) {
    console.log('❌ period_start column is MISSING');
    console.log('   Error:', error1.message);
  } else {
    console.log('✅ period_start column exists');
  }

  console.log('\nTesting period_end column...');
  const { data: test2, error: error2 } = await supabase
    .from('badge_progress')
    .select('period_end')
    .limit(1);

  if (error2) {
    console.log('❌ period_end column is MISSING');
    console.log('   Error:', error2.message);
  } else {
    console.log('✅ period_end column exists');
  }

  console.log('\nTesting last_reset_at column...');
  const { data: test3, error: error3 } = await supabase
    .from('badge_progress')
    .select('last_reset_at')
    .limit(1);

  if (error3) {
    console.log('❌ last_reset_at column is MISSING');
    console.log('   Error:', error3.message);
  } else {
    console.log('✅ last_reset_at column exists');
  }

  // Check what columns ARE present
  console.log('\n\nChecking existing badge_progress records...');
  const { data: sample, error: sampleError } = await supabase
    .from('badge_progress')
    .select('*')
    .limit(1);

  if (sample && sample.length > 0) {
    console.log('Sample record columns:', Object.keys(sample[0]));
  } else if (sampleError) {
    console.log('Error fetching sample:', sampleError.message);
  } else {
    console.log('No records in badge_progress table');
  }

  // If columns are missing, provide the fix
  if (error1 || error2 || error3) {
    console.log('\n\n⚠️  MISSING COLUMNS DETECTED!');
    console.log('Run this SQL in Supabase to fix:\n');
    console.log('----------------------------------------');
    console.log(`-- Add missing columns to badge_progress table
ALTER TABLE badge_progress 
ADD COLUMN IF NOT EXISTS period_start DATE,
ADD COLUMN IF NOT EXISTS period_end DATE,
ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient period queries
CREATE INDEX IF NOT EXISTS idx_badge_progress_period 
ON badge_progress(user_id, badge_id, period_start);

-- Add comments
COMMENT ON COLUMN badge_progress.period_start IS 'Start date of the current period for periodic badges';
COMMENT ON COLUMN badge_progress.period_end IS 'End date of the current period for periodic badges';
COMMENT ON COLUMN badge_progress.last_reset_at IS 'Timestamp of the last progress reset for periodic badges';`);
    console.log('----------------------------------------\n');
  }
}

checkSchema();