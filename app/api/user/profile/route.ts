import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/user/profile - Get user profile with timezone
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching profile:', error)
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
    }

    return NextResponse.json(profile || {})
  } catch (error) {
    console.error('Error in GET /api/user/profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/user/profile - Update user profile (including timezone)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { timezone, full_name, avatar_url } = body

    // Validate timezone if provided
    if (timezone) {
      try {
        // Test if timezone is valid
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
      } catch {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
      }
    }

    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    let profile
    if (existingProfile) {
      // Update existing profile
      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          ...(timezone !== undefined && { timezone }),
          ...(full_name !== undefined && { full_name }),
          ...(avatar_url !== undefined && { avatar_url }),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating profile:', error)
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
      }
      profile = data
    } else {
      // Create new profile
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: user.id,
          email: user.email,
          timezone,
          full_name,
          avatar_url
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating profile:', error)
        return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
      }
      profile = data
    }

    return NextResponse.json(profile)
  } catch (error) {
    console.error('Error in PATCH /api/user/profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}