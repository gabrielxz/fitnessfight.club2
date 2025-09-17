#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  const weekStart = '2025-09-15'

  console.log('Checking weekly_exercise_tracking for week:', weekStart)
  console.log('')

  const { data, error } = await supabase
    .from('weekly_exercise_tracking')
    .select('user_id, hours_logged, week_start')
    .eq('week_start', weekStart)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Found', data?.length || 0, 'records for this week:')
  if (data && data.length > 0) {
    data.forEach(d => {
      console.log(`- User ${d.user_id.substring(0, 8)}: ${d.hours_logged?.toFixed(2)} hours`)
    })
  }

  // Check a few different week formats in case there's a timezone issue
  console.log('\n--- Checking all weeks in the table ---')
  const { data: allWeeks } = await supabase
    .from('weekly_exercise_tracking')
    .select('week_start, count')
    .select('week_start')
    .limit(10)

  const uniqueWeeks = [...new Set(allWeeks?.map(w => w.week_start))]
  console.log('Unique week_start values in table:')
  uniqueWeeks.forEach(w => console.log('-', w))
}

main().catch(console.error)