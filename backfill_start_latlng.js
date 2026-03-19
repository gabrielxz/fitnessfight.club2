// Backfill start_lat / start_lng for existing strava_activities using stored polylines.
// Safe to run multiple times — skips activities that already have coordinates.
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function decodePolyline(encoded) {
  const coords = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : result >> 1
    coords.push([lat / 1e5, lng / 1e5])
  }
  return coords
}

async function main() {
  let offset = 0
  const PAGE = 500
  let updated = 0, skipped = 0, errors = 0

  console.log('Backfilling start_lat/start_lng from polylines...\n')

  while (true) {
    const { data: rows, error } = await supabase
      .from('strava_activities')
      .select('id, map_summary_polyline')
      .is('start_lat', null)
      .not('map_summary_polyline', 'is', null)
      .neq('map_summary_polyline', '')
      .range(offset, offset + PAGE - 1)

    if (error) { console.error('Fetch error:', error); break }
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      try {
        const coords = decodePolyline(row.map_summary_polyline)
        if (!coords.length) { skipped++; continue }
        const [lat, lng] = coords[0]
        const { error: upErr } = await supabase
          .from('strava_activities')
          .update({ start_lat: lat, start_lng: lng })
          .eq('id', row.id)
        if (upErr) { errors++; console.error('Update error:', upErr.message) }
        else updated++
      } catch { skipped++ }
    }

    process.stdout.write(`\r  Updated: ${updated}  Skipped: ${skipped}  Errors: ${errors}`)
    if (rows.length < PAGE) break
    offset += PAGE
  }

  console.log(`\n\nDone. Updated: ${updated}, Skipped (no/bad polyline): ${skipped}, Errors: ${errors}`)
}

main().catch(console.error)
