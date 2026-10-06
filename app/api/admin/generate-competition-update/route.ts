import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin-auth'
import { generateCompetitionUpdate } from '@/lib/weekly-update/generator'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = isAdminUser(user)

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const priming = typeof body?.priming === 'string' ? body.priming : undefined

    const update = await generateCompetitionUpdate(priming)

    return NextResponse.json({ success: true, update })
  } catch (error) {
    console.error('Error generating competition update:', error)
    return NextResponse.json({ error: 'Failed to generate competition update' }, { status: 500 })
  }
}
