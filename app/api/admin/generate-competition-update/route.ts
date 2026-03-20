import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCompetitionUpdate } from '@/lib/weekly-update/generator'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = user.email === 'gabrielbeal@gmail.com' ||
                    user.user_metadata?.full_name === 'Gabriel Beal' ||
                    user.user_metadata?.name === 'Gabriel Beal'

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const update = await generateCompetitionUpdate()

    return NextResponse.json({ success: true, update })
  } catch (error) {
    console.error('Error generating competition update:', error)
    return NextResponse.json({ error: 'Failed to generate competition update' }, { status: 500 })
  }
}
