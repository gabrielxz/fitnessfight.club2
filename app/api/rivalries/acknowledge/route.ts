import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/rivalries/acknowledge
// Body: { matchup_id: string }
//
// Stamps the correct player{1,2}_viewed_at column with NOW() so the
// "you won/lost" celebration modal stops firing for this user + matchup.
//
// RLS on rivalry_matchups allows public SELECT but blocks writes, so the
// update goes through the admin client after we've verified the caller is
// actually a participant in the matchup.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const matchupId = body?.matchup_id
    if (typeof matchupId !== 'string' || matchupId.length === 0) {
      return NextResponse.json({ error: 'Missing matchup_id' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: matchup, error: fetchError } = await admin
      .from('rivalry_matchups')
      .select('id, player1_id, player2_id')
      .eq('id', matchupId)
      .single()

    if (fetchError || !matchup) {
      return NextResponse.json({ error: 'Matchup not found' }, { status: 404 })
    }

    const isPlayer1 = matchup.player1_id === user.id
    const isPlayer2 = matchup.player2_id === user.id
    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
    }

    const column = isPlayer1 ? 'player1_viewed_at' : 'player2_viewed_at'
    const { error: updateError } = await admin
      .from('rivalry_matchups')
      .update({ [column]: new Date().toISOString() })
      .eq('id', matchupId)

    if (updateError) {
      console.error('Failed to acknowledge rivalry result:', updateError)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error acknowledging rivalry result:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
